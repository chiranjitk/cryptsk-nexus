/**
 * e2guardian Configuration Sync Engine
 *
 * Reads ContentFilter records from PostgreSQL and generates e2guardian
 * list files (banned/exception domains) on the actual e2guardian install.
 *
 * On production (Rocky Linux), e2guardian reads from FHS system paths:
 *   /etc/e2guardian/e2guardian/           — configs
 *   /etc/e2guardian/e2guardian/lists/    — list files
 *
 * Environment variables (set in .env or ecosystem.config.cjs):
 *   E2GUARDIAN_CONF_DIR  — config root (default: /etc/e2guardian/e2guardian)
 *   E2GUARDIAN_LIST_DIR  — lists root   (default: ${E2GUARDIAN_CONF_DIR}/lists)
 *
 * Filter group → list directory mapping:
 *   Group 1 (Kids):     lists/group1/   (most restrictive — all categories)
 *   Group 2 (Standard): lists/group2/   (moderate — security + adult + gambling)
 *   Group 3 (Premium):  lists/group3/   (minimal — malware + phishing only)
 *
 * The installed group configs reference __LISTDIR__/localbannedsitelist,
 * so we write domains to each group's list directory.
 */

import { db } from '@/lib/db';
// Node.js-only modules — loaded via require() to avoid Turbopack Edge Runtime analysis.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFile, mkdir, readFile, readdir, stat, copyFile } = /*turbopackIgnore: true*/ require('fs/promises');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = /*turbopackIgnore: true*/ require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = /*turbopackIgnore: true*/ require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = /*turbopackIgnore: true*/ require('child_process');

// ---------------------------------------------------------------------------
// Constants — FHS system paths (configurable via env)
// ---------------------------------------------------------------------------

export const VALID_CATEGORIES = [
  'adult', 'malware', 'phishing', 'social_media', 'streaming',
  'gambling', 'drugs', 'violence', 'proxy', 'vpn', 'ads', 'custom',
  'whitelist',
] as const;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];

/** Category → e2guardian file name (no spaces, lowercase) */
const CATEGORY_FILE_MAP: Record<string, string> = {
  adult: 'adult',
  malware: 'malware',
  phishing: 'phishing',
  social_media: 'social_media',
  streaming: 'streaming',
  gambling: 'gambling',
  drugs: 'drugs',
  violence: 'violence',
  proxy: 'proxy',
  vpn: 'vpn',
  ads: 'ads',
  custom: 'custom',
  whitelist: 'whitelist',
};

/**
 * Which categories each filter group blocks.
 * This MUST match the StaySuite hospitality policy.
 */
const GROUP_POLICIES: Record<number, string[]> = {
  1: ['adult', 'malware', 'phishing', 'social_media', 'streaming', 'gambling', 'drugs', 'violence', 'proxy', 'vpn', 'ads'],
  2: ['malware', 'phishing', 'ads', 'violence', 'drugs', 'gambling', 'proxy', 'vpn', 'adult'],
  3: ['malware', 'phishing'],
};

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve e2guardian config directory.
 * Production: /etc/e2guardian/e2guardian
 * Sandbox: falls back to local data directory for development
 */
function getConfDir(): string {
  if (process.env.E2GUARDIAN_CONF_DIR) {
    return process.env.E2GUARDIAN_CONF_DIR;
  }
  // Production FHS path
  if (existsSync(/*turbopackIgnore: true*/ '/etc/e2guardian/e2guardian')) {
    return '/etc/e2guardian/e2guardian';
  }
  // Sandbox fallback
  return join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'e2guardian', 'configs');
}

function getListDir(): string {
  if (process.env.E2GUARDIAN_LIST_DIR) {
    return process.env.E2GUARDIAN_LIST_DIR;
  }
  const confDir = getConfDir();
  const listDir = join(/*turbopackIgnore: true*/ confDir, 'lists');
  if (existsSync(/*turbopackIgnore: true*/ listDir)) {
    return listDir;
  }
  // Sandbox fallback
  return join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'e2guardian', 'lists');
}

function getGroupListDir(groupNum: number): string {
  return join(/*turbopackIgnore: true*/ getListDir(), `group${groupNum}`);
}

function getStatusFile(): string {
  if (process.env.E2GUARDIAN_STATUS_FILE) {
    return process.env.E2GUARDIAN_STATUS_FILE;
  }
  if (existsSync(/*turbopackIgnore: true*/ '/etc/e2guardian')) {
    return '/etc/e2guardian/sync-status.json';
  }
  return join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'e2guardian', 'status.json');
}

/**
 * Find the e2guardian_ipgroups.sh script and reload e2guardian.
 * The script: (1) queries DB for active sessions, (2) writes ipgroups file,
 * (3) sends systemctl reload / HUP to e2guardian.
 *
 * This is a best-effort call — failures are logged but never throw.
 */
function reloadE2guardian(): void {
  const scriptPaths = [
    join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'staysuite_core', 'e2guardian_ipgroups.sh'),
    '/usr/local/bin/e2guardian_ipgroups.sh',
    '/opt/staysuite/scripts/e2guardian_ipgroups.sh',
  ];

  let script = '';
  for (const p of scriptPaths) {
    if (existsSync(/*turbopackIgnore: true*/ p)) { script = p; break; }
  }

  if (!script) {
    console.warn('[e2guardian-sync] e2guardian_ipgroups.sh not found — skipping reload');
    return;
  }

  try {
    const output = execSync(`bash "${script}" 2>&1`, {
      timeout: 10000, // 10s max (DB query + file write + reload)
      encoding: 'utf-8',
      env: { ...process.env },
    });
    if (output) console.log(`[e2guardian-sync] reload: ${output.trim()}`);
  } catch (err) {
    console.warn('[e2guardian-sync] reload script failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  success: boolean;
  categoriesGenerated: string[];
  totalDomainsWritten: number;
  filesWritten: Record<string, number>;
  configFilesGenerated: string[];
  message: string;
  syncedAt: string;
  duration: number;
  /** Which groups were updated */
  groupsUpdated: number[];
  /** Resolved paths used during sync (for debugging) */
  resolvedPaths: {
    confDir: string;
    listDir: string;
  };
}

interface SyncStatus {
  lastSyncAt: string;
  tenantId: string;
  propertyId?: string;
  totalDomains: number;
  categoriesCount: number;
  filtersActive: number;
  groupsUpdated: number[];
  resolvedPaths: {
    confDir: string;
    listDir: string;
  };
}

interface CategoryData {
  category: string;
  domains: string[];
}

// ---------------------------------------------------------------------------
// Core: Write list files
// ---------------------------------------------------------------------------

async function ensureGroupDirs(groups: number[]): Promise<void> {
  for (const g of groups) {
    const dir = getGroupListDir(g);
    if (!existsSync(/*turbopackIgnore: true*/ dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

function domainLine(domain: string): string {
  const cleaned = domain.trim().toLowerCase();
  if (!cleaned) return '';
  return cleaned;
}

async function writeListFile(
  dir: string,
  fileName: string,
  domains: string[],
): Promise<number> {
  const filePath = join(/*turbopackIgnore: true*/ dir, fileName);
  const lines = domains.map(domainLine).filter(Boolean);
  const unique = [...new Set(lines)];
  const content = unique.join('\n') + (unique.length > 0 ? '\n' : '');
  await writeFile(filePath, content, 'utf-8');
  return unique.length;
}

// ---------------------------------------------------------------------------
// Core: Sync domains to e2guardian list files
// ---------------------------------------------------------------------------

/**
 * For each filter group, write the appropriate domains to localbannedsitelist.
 * The installed group configs reference __LISTDIR__/localbannedsitelist.
 */
async function syncGroupLists(
  categories: Record<string, string[]>,
  groups: number[],
): Promise<{ groupsUpdated: number[]; filesWritten: Record<string, number> }> {
  const groupsUpdated: number[] = [];
  const filesWritten: Record<string, number> = {};
  let total = 0;

  for (const groupNum of groups) {
    const policyCategories = GROUP_POLICIES[groupNum] || [];
    // Collect domains for categories that are both in the policy AND in our DB
    const groupDomains: string[] = [];
    for (const cat of policyCategories) {
      if (categories[cat]) {
        groupDomains.push(...categories[cat]);
      }
    }

    // Deduplicate
    const unique = [...new Set(groupDomains.map(d => d.trim().toLowerCase()).filter(Boolean))];
    const dir = getGroupListDir(groupNum);

    // Write to localbannedsitelist (HTTP plaintext blocking)
    const countHttp = await writeListFile(dir, 'localbannedsitelist', unique);
    filesWritten[`group${groupNum}_localbanned`] = countHttp;
    total += countHttp;

    // Write to bannedsslsitelist (HTTPS/SNI blocking — CRITICAL)
    // In SNI-only mode (sslmitm=off), e2guardian checks THIS list for HTTPS domains.
    // Without it, NO HTTPS sites are blocked.
    const countSsl = await writeListFile(dir, 'bannedsslsitelist', unique);
    filesWritten[`group${groupNum}_bannedssl`] = countSsl;
    total += countSsl;

    groupsUpdated.push(groupNum);
  }

  return { groupsUpdated, filesWritten: { ...filesWritten, _total: total } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full sync: reads DB, writes e2guardian list files to the FHS system path.
 * Does NOT overwrite e2guardian.conf or filter group configs — the install
 * script handles those. This only writes the domain list files that the
 * installed configs reference via __LISTDIR__/localbannedsitelist.
 */
export async function syncE2guardianConfig(
  tenantId: string,
  propertyId?: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  const filesWritten: Record<string, number> = {};
  const categoriesGenerated: string[] = [];
  let totalDomainsWritten = 0;
  const confDir = getConfDir();
  const listDir = getListDir();

  try {
    // 1. Query all enabled ContentFilter records
    const where: Record<string, unknown> = {
      tenantId,
      enabled: true,
    };
    if (propertyId) where.propertyId = propertyId;

    const filters = await db.contentFilter.findMany({
      where,
      select: { category: true, domains: true, name: true },
    });

    // 2. Group domains by category, deduplicate
    const categories: Record<string, string[]> = {};
    for (const filter of filters) {
      let domains: string[] = [];
      try {
        const parsed = JSON.parse(filter.domains || '[]');
        if (Array.isArray(parsed)) domains = parsed.map(String).filter(Boolean);
      } catch {
        // skip malformed
      }
      if (domains.length === 0) continue;

      if (!categories[filter.category]) {
        categories[filter.category] = [];
      }
      categories[filter.category].push(
        ...domains.map(d => d.trim().toLowerCase()),
      );
    }

    // Deduplicate per category
    for (const cat of Object.keys(categories)) {
      categories[cat] = [...new Set(categories[cat])];
      categoriesGenerated.push(cat);
      totalDomainsWritten += categories[cat].length;
    }

    // 3. Ensure group list directories exist
    await ensureGroupDirs([1, 2, 3]);

    // 4. Write per-group banned lists
    const { groupsUpdated, filesWritten: groupFiles } = await syncGroupLists(categories, [1, 2, 3]);
    Object.assign(filesWritten, groupFiles);

    // 5. Write category-level list files (for reference/debugging)
    const staysuiteDir = join(/*turbopackIgnore: true*/ listDir, 'staysuite', 'banned');
    if (!existsSync(/*turbopackIgnore: true*/ staysuiteDir)) {
      await mkdir(staysuiteDir, { recursive: true });
    }
    for (const [cat, domains] of Object.entries(categories)) {
      const fileName = CATEGORY_FILE_MAP[cat] || cat;
      const count = await writeListFile(staysuiteDir, fileName, domains);
      filesWritten[`staysuite_${cat}`] = count;
    }

    // 6. Write status file
    const status: SyncStatus = {
      lastSyncAt: new Date().toISOString(),
      tenantId,
      propertyId,
      totalDomains: totalDomainsWritten,
      categoriesCount: categoriesGenerated.length,
      filtersActive: filters.length,
      groupsUpdated,
      resolvedPaths: { confDir, listDir },
    };
    const statusFile = getStatusFile();
    const statusDir = statusFile.substring(0, statusFile.lastIndexOf('/'));
    if (!existsSync(/*turbopackIgnore: true*/ statusDir)) {
      await mkdir(statusDir, { recursive: true });
    }
    await writeFile(statusFile, JSON.stringify(status, null, 2), 'utf-8');

    const duration = Date.now() - startTime;
    console.log(
      `[e2guardian-sync] Sync complete: ${totalDomainsWritten} domains across ${categoriesGenerated.length} categories, groups ${groupsUpdated.join(',')} updated in ${duration}ms`,
    );
    console.log(`[e2guardian-sync] Config dir: ${confDir}`);
    console.log(`[e2guardian-sync] List dir: ${listDir}`);

    // Reload e2guardian: regenerate ipgroups + HUP/reload (non-blocking)
    reloadE2guardian();

    return {
      success: true,
      categoriesGenerated,
      totalDomainsWritten,
      filesWritten,
      configFilesGenerated: [],
      message: `Synced ${totalDomainsWritten} domains across ${categoriesGenerated.length} categories to groups ${groupsUpdated.join('/')}.`,
      syncedAt: new Date().toISOString(),
      duration,
      groupsUpdated,
      resolvedPaths: { confDir, listDir },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[e2guardian-sync] Sync failed after ${duration}ms:`, error);

    return {
      success: false,
      categoriesGenerated,
      totalDomainsWritten,
      filesWritten,
      configFilesGenerated: [],
      message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      syncedAt: new Date().toISOString(),
      duration,
      groupsUpdated: [],
      resolvedPaths: { confDir, listDir },
    };
  }
}

/**
 * Sync from pre-grouped domain data (used by /sync endpoint).
 */
export async function syncE2guardianConfigFromData(
  categoriesWithDomains: Record<string, string[]>,
): Promise<SyncResult> {
  const startTime = Date.now();
  const filesWritten: Record<string, number> = {};
  const categoriesGenerated: string[] = [];
  let totalDomainsWritten = 0;
  const confDir = getConfDir();
  const listDir = getListDir();

  try {
    // Deduplicate per category
    const categories: Record<string, string[]> = {};
    for (const [category, domains] of Object.entries(categoriesWithDomains)) {
      if (!domains || domains.length === 0) continue;
      categories[category] = [...new Set(domains.map(d => d.trim().toLowerCase()).filter(Boolean))];
      categoriesGenerated.push(category);
      totalDomainsWritten += categories[category].length;
    }

    // Ensure group dirs and write lists
    await ensureGroupDirs([1, 2, 3]);
    const { groupsUpdated, filesWritten: groupFiles } = await syncGroupLists(categories, [1, 2, 3]);
    Object.assign(filesWritten, groupFiles);

    // Category-level reference files
    const staysuiteDir = join(/*turbopackIgnore: true*/ listDir, 'staysuite', 'banned');
    if (!existsSync(/*turbopackIgnore: true*/ staysuiteDir)) {
      await mkdir(staysuiteDir, { recursive: true });
    }
    for (const [cat, domains] of Object.entries(categories)) {
      const fileName = CATEGORY_FILE_MAP[cat] || cat;
      const count = await writeListFile(staysuiteDir, fileName, domains);
      filesWritten[`staysuite_${cat}`] = count;
    }

    // Status
    const status: SyncStatus = {
      lastSyncAt: new Date().toISOString(),
      tenantId: 'unknown',
      totalDomains: totalDomainsWritten,
      categoriesCount: categoriesGenerated.length,
      filtersActive: 0,
      groupsUpdated,
      resolvedPaths: { confDir, listDir },
    };
    const statusFile = getStatusFile();
    const statusDir = statusFile.substring(0, statusFile.lastIndexOf('/'));
    if (!existsSync(/*turbopackIgnore: true*/ statusDir)) {
      await mkdir(statusDir, { recursive: true });
    }
    await writeFile(statusFile, JSON.stringify(status, null, 2), 'utf-8');

    const duration = Date.now() - startTime;

    // Reload e2guardian: regenerate ipgroups + HUP/reload (non-blocking)
    reloadE2guardian();

    return {
      success: true,
      categoriesGenerated,
      totalDomainsWritten,
      filesWritten,
      configFilesGenerated: [],
      message: `Synced ${totalDomainsWritten} domains across ${categoriesGenerated.length} categories to groups ${groupsUpdated.join('/')}.`,
      syncedAt: new Date().toISOString(),
      duration,
      groupsUpdated,
      resolvedPaths: { confDir, listDir },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      categoriesGenerated,
      totalDomainsWritten,
      filesWritten,
      configFilesGenerated: [],
      message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      syncedAt: new Date().toISOString(),
      duration,
      groupsUpdated: [],
      resolvedPaths: { confDir, listDir },
    };
  }
}

/**
 * Read the last sync status from disk.
 */
export async function getSyncStatus(): Promise<SyncStatus | null> {
  try {
    const statusFile = getStatusFile();
    if (!existsSync(/*turbopackIgnore: true*/ statusFile)) return null;
    const raw = await readFile(/*turbopackIgnore: true*/ statusFile, 'utf-8');
    return JSON.parse(raw) as SyncStatus;
  } catch {
    return null;
  }
}

/**
 * Get a summary of generated list files (for display in the UI).
 * Reads from both the per-group directories and the staysuite reference directory.
 */
export async function getListFilesSummary(): Promise<{
  banned: Record<string, { file: string; domains: number; lastModified: string | null }>;
  groups: Record<string, { localBannedDomains: number; bannedSslDomains: number; lastModified: string | null }>;
  configs: string[];
  status: SyncStatus | null;
  resolvedPaths: { confDir: string; listDir: string };
}> {
  const banned: Record<string, { file: string; domains: number; lastModified: string | null }> = {};
  const groups: Record<string, { localBannedDomains: number; lastModified: string | null }> = {};
  const confDir = getConfDir();
  const listDir = getListDir();

  // Read per-group localbannedsitelist and bannedsslsitelist files
  for (const g of [1, 2, 3]) {
    const dir = getGroupListDir(g);
    const httpPath = join(/*turbopackIgnore: true*/ dir, 'localbannedsitelist');
    const sslPath = join(/*turbopackIgnore: true*/ dir, 'bannedsslsitelist');
    let httpCount = 0, sslCount = 0;
    let lastMod: string | null = null;
    try {
      if (existsSync(/*turbopackIgnore: true*/ httpPath)) {
        const content = await readFile(/*turbopackIgnore: true*/ httpPath, 'utf-8');
        httpCount = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
        const fileStat = await stat(/*turbopackIgnore: true*/ httpPath);
        lastMod = fileStat.mtime.toISOString();
      }
    } catch { /* skip */ }
    try {
      if (existsSync(/*turbopackIgnore: true*/ sslPath)) {
        const content = await readFile(/*turbopackIgnore: true*/ sslPath, 'utf-8');
        sslCount = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
      }
    } catch { /* skip */ }
    groups[`group${g}`] = { localBannedDomains: httpCount, bannedSslDomains: sslCount, lastModified: lastMod };
  }

  // Read staysuite reference lists
  const staysuiteDir = join(/*turbopackIgnore: true*/ listDir, 'staysuite', 'banned');
  try {
    if (existsSync(/*turbopackIgnore: true*/ staysuiteDir)) {
      const files = await readdir(staysuiteDir);
      for (const file of files) {
        const filePath = join(/*turbopackIgnore: true*/ staysuiteDir, file);
        try {
          const content = await readFile(/*turbopackIgnore: true*/ filePath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
          const fileStat = await stat(/*turbopackIgnore: true*/ filePath);
          banned[file] = {
            file,
            domains: lines.length,
            lastModified: fileStat.mtime.toISOString(),
          };
        } catch {
          banned[file] = { file, domains: 0, lastModified: null };
        }
      }
    }
  } catch {
    // directory doesn't exist yet
  }

  // List config files
  const configs: string[] = [];
  try {
    if (existsSync(/*turbopackIgnore: true*/ confDir)) {
      const files = await readdir(confDir).catch(() => []);
      const confFiles = files.filter(f => f.endsWith('.conf'));
      configs.push(...confFiles.sort());
    }
  } catch {
    // directory doesn't exist yet
  }

  return {
    banned,
    groups,
    configs,
    status: await getSyncStatus(),
    resolvedPaths: { confDir, listDir },
  };
}
