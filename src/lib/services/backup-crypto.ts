/**
 * Cryptsk Backup Encryption Service
 *
 * Provides AES-256-GCM encryption/decryption for database backups.
 * The encryption key is derived from a machine-specific secret stored in the DB,
 * so only this application instance can decrypt its own backups.
 *
 * File format:
 *   [8 bytes: "CRPTSK01"] (magic header)
 *   [12 bytes: IV]
 *   [16 bytes: Auth Tag]
 *   [remaining: encrypted payload]
 *
 * Future: When migrating to PostgreSQL, only the dump generation changes.
 * The encryption/decryption layer stays identical.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// ─── Constants ──────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAGIC_HEADER = Buffer.from("CRPTSK01"); // 8 bytes
const PBKDF2_ITERATIONS = 100_000;

// ─── Key Management ─────────────────────────────────────────────

/**
 * Derive a 256-bit AES key from the encryption passphrase using PBKDF2.
 * Uses SHA-512 for maximum security.
 */
async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const crypto = await import("crypto");
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Get or create the encryption passphrase stored in IspSettings.
 * This ties the encryption key to the application instance.
 */
async function getEncryptionPassphrase(): Promise<string> {
  const { db } = await import("@/lib/db");
  const settings = await db.ispSettings.findUnique({ where: { id: "default" } });

  let passphrase = settings?.encryptionKey;

  if (!passphrase) {
    // Generate a new 64-char hex passphrase (512 bits of entropy)
    passphrase = randomBytes(64).toString("hex");

    // Store it in IspSettings
    await db.ispSettings.upsert({
      where: { id: "default" },
      update: { encryptionKey: passphrase },
      create: { id: "default", encryptionKey: passphrase },
    });
  }

  return passphrase;
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────

/**
 * Encrypt a Buffer of data using AES-256-GCM.
 * Returns a Buffer with format: [CRPTSK01 header][salt (16 bytes)][IV (12 bytes)][auth tag (16 bytes)][ciphertext]
 */
async function encryptData(plaintext: Buffer): Promise<Buffer> {
  const passphrase = await getEncryptionPassphrase();
  const salt = randomBytes(16); // unique salt per encryption
  const key = await deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Layout: [CRPTSK01 (8)] [salt (16)] [iv (12)] [authTag (16)] [ciphertext]
  return Buffer.concat([MAGIC_HEADER, salt, iv, authTag, encrypted]);
}

/**
 * Decrypt a CRPTSK01 encrypted buffer back to the original plaintext.
 * Validates the magic header and auth tag to ensure integrity.
 */
async function decryptData(encryptedBuffer: Buffer): Promise<Buffer> {
  // Validate minimum size: header(8) + salt(16) + iv(12) + authTag(16) = 52 bytes minimum
  if (encryptedBuffer.length < 52) {
    throw new Error("Invalid encrypted file: too small");
  }

  // Validate magic header
  const header = encryptedBuffer.subarray(0, 8);
  if (!header.equals(MAGIC_HEADER)) {
    throw new Error("Invalid encrypted file: not a Cryptsk backup (wrong magic header)");
  }

  const passphrase = await getEncryptionPassphrase();
  const salt = encryptedBuffer.subarray(8, 24);       // 16 bytes
  const iv = encryptedBuffer.subarray(24, 36);         // 12 bytes
  const authTag = encryptedBuffer.subarray(36, 52);    // 16 bytes
  const ciphertext = encryptedBuffer.subarray(52);     // remaining

  const key = await deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  } catch (error) {
    throw new Error(
      "Decryption failed: wrong encryption key or corrupted backup. " +
      "Backups can only be restored by the same application instance that created them."
    );
  }
}

// ─── SQL Dump Generation (SQLite via Prisma) ─────────────────────

/**
 * Generate a complete SQL dump of the SQLite database using Prisma's raw queries.
 * Future: When migrating to PostgreSQL, replace this with `pg_dump`.
 */
async function generateSQLDump(dbPath: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const statements: string[] = [];

  statements.push("-- ============================================");
  statements.push("-- Cryptsk ISP Platform - Full Database Dump");
  statements.push(`-- Generated: ${new Date().toISOString()}`);
  statements.push(`-- Database: SQLite (${dbPath})`);
  statements.push("-- Encryption: AES-256-GCM");
  statements.push("-- ============================================");
  statements.push("");
  statements.push("BEGIN TRANSACTION;");
  statements.push("");

  // 1. Get all SQL statements for schema objects (tables, indexes, triggers, views)
  const schemaRows = await db.$queryRawUnsafe<{ type: string; name: string; sql: string }[]>(
    `SELECT type, name, sql FROM sqlite_master 
     WHERE sql IS NOT NULL AND type IN ('table', 'index', 'trigger', 'view')
     ORDER BY type, name`
  );

  // 2. Output all schema DDL
  for (const row of schemaRows) {
    statements.push(`-- ${row.type.toUpperCase()}: ${row.name}`);
    statements.push(row.sql + ";");
    statements.push("");
  }

  // 3. Dump data for all tables (INSERT statements)
  const tables = schemaRows
    .filter((r) => r.type === "table")
    .map((r) => r.name);

  for (const table of tables) {
    // Skip internal SQLite tables
    if (table.startsWith("sqlite_")) continue;

    const countResult = await db.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM "${table}"`
    );
    if (countResult[0]?.cnt === 0) {
      statements.push(`-- TABLE: ${table} (0 rows, skipped)`);
      continue;
    }

    const rowCount = countResult[0].cnt;
    statements.push(`-- TABLE: ${table} (${rowCount} rows)`);

    // Get column info for proper quoting
    const columns = await db.$queryRawUnsafe<{ name: string; type: string }[]>(
      `PRAGMA table_info("${table}")`
    );
    const colNames = columns.map((c) => c.name);

    // Fetch rows in batches to avoid memory issues
    const BATCH_SIZE = 500;
    let offset = 0;

    while (true) {
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const values = colNames.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "NULL";
          if (typeof val === "number") return String(val);
          if (typeof val === "bigint") return String(val);
          if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
          // Escape single quotes in strings
          const escaped = String(val).replace(/'/g, "''");
          return `'${escaped}'`;
        });
        statements.push(
          `INSERT INTO "${table}" ("${colNames.join('", "')}") VALUES (${values.join(", ")});`
        );
      }

      offset += BATCH_SIZE;

      // Flush periodically for very large tables
      if (offset % 5000 === 0) {
        statements.push("");
      }
    }

    statements.push("");
  }

  // Handle sequences/auto-increments (only exists if AUTOINCREMENT tables exist)
  try {
    const sequences = await db.$queryRawUnsafe<{ name: string; seq: number }[]>(
      `SELECT name, seq FROM sqlite_sequence ORDER BY name`
    );

    if (sequences.length > 0) {
      statements.push("-- Auto-increment sequence values");
      for (const seq of sequences) {
        statements.push(
          `UPDATE sqlite_sequence SET seq = ${seq.seq} WHERE name = '${seq.name.replace(/'/g, "''")}';`
        );
      }
      statements.push("");
    }
  } catch {
    // sqlite_sequence table doesn't exist (no AUTOINCREMENT columns) - this is normal
  }

  statements.push("COMMIT;");
  statements.push("");
  statements.push(`-- Dump complete. ${tables.length} tables, ${statements.length} lines.`);

  return statements.join("\n");
}

/**
 * Restore a SQL dump into the SQLite database using Prisma raw queries.
 * Drops existing tables and recreates from the dump.
 */
async function restoreSQLDump(dbPath: string, sqlDump: string): Promise<void> {
  const { db } = await import("@/lib/db");

  // Split SQL into individual statements (handle multi-line statements)
  // Remove comments and empty lines, then split by semicolons
  const lines = sqlDump.split("\n");
  const cleanStatements: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip standalone comments and empty lines
    if (trimmed.startsWith("--") || trimmed === "") continue;
    current += " " + line;
    if (trimmed.endsWith(";")) {
      cleanStatements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) cleanStatements.push(current.trim());

  // Filter out control statements that Prisma can handle
  const skipPatterns = [
    /^BEGIN TRANSACTION/i,
    /^COMMIT/i,
    /^PRAGMA/i,
  ];

  // Allowlist of safe SQL statement prefixes for restore
  const ALLOWED_SQL_PREFIXES = [
    /^CREATE\s+TABLE/i,
    /^INSERT\s+INTO/i,
    /^DROP\s+TABLE/i,
    /^CREATE\s+(UNIQUE\s+)?INDEX/i,
    /^CREATE\s+TRIGGER/i,
    /^CREATE\s+VIEW/i,
    /^UPDATE\s+sqlite_sequence/i,
    /^ALTER\s+TABLE/i,
  ];

  // Execute statements in a transaction
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    // Drop all existing tables first (except sqlite internal tables)
    const existingTables = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    for (const t of existingTables) {
      try {
        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t.name}"`);
      } catch {
        // ignore - might fail due to FK constraints
      }
    }

    // Now execute the dump statements
    const failedStatements: string[] = [];
    for (const stmt of cleanStatements) {
      if (skipPatterns.some((p) => p.test(stmt))) continue;
      if (stmt.trim() === "") continue;

      // Only execute statements that match the safe SQL allowlist
      if (!ALLOWED_SQL_PREFIXES.some((rx) => rx.test(stmt.trim()))) {
        console.warn(`[Backup] Skipping non-standard SQL: ${stmt.substring(0, 100)}`);
        continue;
      }

      try {
        await db.$executeRawUnsafe(stmt);
      } catch (err) {
        // Track failed statements
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Restore SQL warning: ${msg} | Statement: ${stmt.substring(0, 100)}...`);
        failedStatements.push(stmt.substring(0, 100));
      }
    }

    if (failedStatements.length > 0) {
      console.warn(`Restore completed with ${failedStatements.length} failed statement(s)`);
    }

    // Integrity check
    const result = await db.$queryRawUnsafe<{ integrity_check: string }[]>(
      "PRAGMA integrity_check"
    );
    if (result[0]?.integrity_check !== "ok") {
      throw new Error(`Database integrity check failed: ${result[0]?.integrity_check}`);
    }
  } finally {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

// ─── Public API ─────────────────────────────────────────────────

export interface EncryptedBackupResult {
  encryptedBuffer: Buffer;
  originalSize: number;
  encryptedSize: number;
  tableCount: number;
  dumpLines: number;
  timestamp: string;
}

/**
 * Create a full encrypted database backup.
 * Returns the encrypted buffer ready to save or upload.
 */
export async function createEncryptedBackup(dbPath: string): Promise<EncryptedBackupResult> {
  const startTime = Date.now();

  // Step 1: Generate SQL dump
  const sqlDump = await generateSQLDump(dbPath);
  const dumpLines = sqlDump.split("\n").length;
  const tableCount = (sqlDump.match(/CREATE TABLE/g) || []).length;
  const originalSize = Buffer.byteLength(sqlDump, "utf-8");

  // Step 2: Encrypt
  const plaintext = Buffer.from(sqlDump, "utf-8");
  const encryptedBuffer = await encryptData(plaintext);

  return {
    encryptedBuffer,
    originalSize,
    encryptedSize: encryptedBuffer.length,
    tableCount,
    dumpLines,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Restore from an encrypted backup file.
 * Validates the file, decrypts it, and applies the SQL dump.
 */
export async function restoreEncryptedBackup(
  dbPath: string,
  encryptedBuffer: Buffer
): Promise<{ tableCount: number; dumpLines: number; duration: number }> {
  const startTime = Date.now();

  // Step 1: Decrypt
  const sqlDump = (await decryptData(encryptedBuffer)).toString("utf-8");
  const dumpLines = sqlDump.split("\n").length;
  const tableCount = (sqlDump.match(/CREATE TABLE/g) || []).length;

  // Step 2: Restore
  await restoreSQLDump(dbPath, sqlDump);

  return {
    tableCount,
    dumpLines,
    duration: Math.round((Date.now() - startTime) / 1000),
  };
}

/**
 * Validate an encrypted backup file without restoring it.
 * Checks magic header and attempts decryption.
 */
export async function validateEncryptedBackup(encryptedBuffer: Buffer): Promise<{
  valid: boolean;
  message: string;
  info?: { tableCount: number; dumpLines: number; originalSize: number; encryptedSize: number };
}> {
  try {
    const decrypted = await decryptData(encryptedBuffer);
    const sqlDump = decrypted.toString("utf-8");
    const tableCount = (sqlDump.match(/CREATE TABLE/g) || []).length;
    const dumpLines = sqlDump.split("\n").length;

    return {
      valid: true,
      message: `Valid backup: ${tableCount} tables, ${dumpLines} lines`,
      info: {
        tableCount,
        dumpLines,
        originalSize: decrypted.length,
        encryptedSize: encryptedBuffer.length,
      },
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "Invalid backup file",
    };
  }
}

/**
 * Check if a buffer is a Cryptsk encrypted backup file.
 */
export function isCryptskEncryptedBackup(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(MAGIC_HEADER);
}
