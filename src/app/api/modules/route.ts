import { NextResponse, NextRequest } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { MODULES, DEPLOYMENT_PRESETS, checkDependencies, getDefaultEnabledModules } from "@/lib/modules/registry";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const CONFIG_PATH = join(process.cwd(), "data", "module-config.json");

interface ModuleConfig {
  enabledModules: string[];
  deploymentType: string;
  updatedAt: string;
}

// ─── File-based fallback (used if DB lookup fails) ─────────
function readConfigFile(): ModuleConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as ModuleConfig;
    }
  } catch {
    // ignore parse errors
  }
  return {
    enabledModules: getDefaultEnabledModules(),
    deploymentType: "isp",
    updatedAt: new Date().toISOString(),
  };
}

function writeConfigFile(config: ModuleConfig): void {
  const dir = join(process.cwd(), "data");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  config.updatedAt = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── DB-backed module state (Phase 1 fix: persists across restarts) ─
async function readModuleStatesFromDB(): Promise<Map<string, { enabled: boolean; deploymentType: string; settings: unknown }>> {
  const map = new Map<string, { enabled: boolean; deploymentType: string; settings: unknown }>();
  try {
    const states = await db.moduleState.findMany();
    for (const s of states) {
      map.set(s.moduleId, {
        enabled: s.enabled,
        deploymentType: s.deploymentType,
        settings: s.settings,
      });
    }
  } catch (err) {
    logger.warn("module_state_db_read_failed_fallback_to_file", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return map;
}

async function upsertModuleState(moduleId: string, enabled: boolean, deploymentType: string, settings?: unknown): Promise<void> {
  try {
    await db.moduleState.upsert({
      where: { moduleId },
      create: { moduleId, enabled, deploymentType, settings: settings as never },
      update: { enabled, deploymentType, settings: settings as never },
    });
  } catch (err) {
    logger.warn("module_state_db_upsert_failed", {
      moduleId, enabled, error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Hybrid read: DB first, file fallback, default last ─────
async function readConfigHybrid(): Promise<ModuleConfig> {
  // 1. Try DB
  const dbStates = await readModuleStatesFromDB();
  if (dbStates.size > 0) {
    const enabledModules: string[] = [];
    let deploymentType = "isp";
    for (const [modId, state] of dbStates.entries()) {
      if (state.enabled) enabledModules.push(modId);
      deploymentType = state.deploymentType || deploymentType;
    }
    // ─── Auto-enable newly shipped modules ───────────────────────
    // Modules with NO persisted row yet (added to the registry after
    // the last save) fall back to their registry default, so fresh
    // modules appear in the sidebar / Module Manager immediately
    // instead of staying invisible until the next explicit save.
    for (const mod of MODULES) {
      if (!dbStates.has(mod.id) && mod.defaultEnabled && !enabledModules.includes(mod.id)) {
        enabledModules.push(mod.id);
      }
    }
    return {
      enabledModules: enabledModules.length > 0 ? enabledModules : getDefaultEnabledModules(),
      deploymentType,
      updatedAt: new Date().toISOString(),
    };
  }
  // 2. Fallback to file
  return readConfigFile();
}

async function writeConfigHybrid(config: ModuleConfig): Promise<void> {
  // Write to DB (per-module upsert)
  for (const modId of MODULES.map(m => m.id)) {
    const enabled = config.enabledModules.includes(modId);
    await upsertModuleState(modId, enabled, config.deploymentType);
  }
  // Also write to file (for backward compat)
  writeConfigFile(config);
}

// ─── GET /api/modules ──────────────────────────────────────────
// Returns all module definitions with current enabled status
export async function GET(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    const config = await readConfigHybrid();
    const { enabledModules, deploymentType } = config;

    // Read gateway mode from DB (real flag)
    let gatewayModeEnabled = false;
    try {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      gatewayModeEnabled = settings?.gatewayModeEnabled ?? false;
    } catch (dbErr) {
      console.error("[GET /api/modules] Failed to read gateway mode from DB:", dbErr);
      // Keep gatewayModeEnabled as false — never fallback to file-based config
    }

    // Build module list with status
    const moduleList = MODULES.map((mod) => ({
      ...mod,
      isEnabled: enabledModules.includes(mod.id),
      canDisable: mod.category !== "core",
      dependencyStatus: checkDependencies(mod.id, enabledModules),
    }));

    // Get presets
    const presets = DEPLOYMENT_PRESETS.map((p) => ({
      ...p,
      isActive: p.id === deploymentType,
    }));

    return NextResponse.json({
      modules: moduleList,
      enabledModules,
      deploymentType,
      gatewayModeEnabled,
      presets,
      totalModules: MODULES.length,
      enabledCount: enabledModules.length,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error("[GET /api/modules] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules", enabledModules: getDefaultEnabledModules(), deploymentType: "isp" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/modules ─────────────────────────────────────────
// Update enabled modules and/or deployment type
export async function PUT(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    const body = await request.json();
    const { enabledModules, deploymentType, applyPreset } = body;

    let finalModules: string[];
    let finalType: string;

    if (applyPreset) {
      const preset = DEPLOYMENT_PRESETS.find((p) => p.id === applyPreset);
      if (!preset) {
        return NextResponse.json({ error: `Unknown preset: ${applyPreset}` }, { status: 400 });
      }
      finalModules = preset.enabledModules;
      finalType = preset.id;
    } else {
      finalModules = enabledModules || [];
      finalType = deploymentType || "isp";

      // Always include core modules
      const coreIds = MODULES.filter((m) => m.category === "core").map((m) => m.id);
      finalModules = [...new Set([...coreIds, ...finalModules])];
    }

    // Validate all dependencies are met
    const missing: string[] = [];
    for (const moduleId of finalModules) {
      const { missing: deps } = checkDependencies(moduleId, finalModules);
      missing.push(...deps);
    }
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing dependencies: ${[...new Set(missing)].join(", ")}` },
        { status: 400 }
      );
    }

    // ─── Sync Gateway Mode to DB FIRST ─────────────────────────
    // Write to DB before file to avoid race condition: if DB fails, don't touch the file
    const gatewayEnabled = finalModules.includes("gateway");
    try {
      await db.ispSettings.upsert({
        where: { id: "default" },
        update: { gatewayModeEnabled: gatewayEnabled },
        create: { id: "default", gatewayModeEnabled: gatewayEnabled },
      });
    } catch (dbErr) {
      console.error("[PUT /api/modules] Failed to sync gateway mode to DB:", dbErr);
      return NextResponse.json(
        { error: "Failed to update gateway mode in database" },
        { status: 500 }
      );
    }

    // DB succeeded — now write config file
    await writeConfigHybrid({ enabledModules: finalModules, deploymentType: finalType, updatedAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      enabledModules: finalModules,
      deploymentType: finalType,
      gatewayModeEnabled: gatewayEnabled,
      message: `Modules updated successfully. ${finalModules.length} modules enabled. Gateway Mode: ${gatewayEnabled ? "ON" : "OFF"}`,
    });
  } catch (error) {
    console.error("[PUT /api/modules] Error:", error);
    return NextResponse.json({ error: "Failed to update modules" }, { status: 500 });
  }
}
