import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { existsSync, statSync } from "fs";
import { join } from "path";
import type { NextRequest } from "next/server";

const BACKUP_DIR = join(process.cwd(), "db", "backups");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const record = await db.backupRecord.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Backup record not found" }, { status: 404 });
    }

    // Remote backups (cloud) — treat as valid if status is COMPLETED
    const isRemote = record.filePath === "Local" ||
      record.filePath.startsWith("AWS S3") ||
      record.filePath.startsWith("Google Drive") ||
      record.filePath.startsWith("Microsoft OneDrive") ||
      record.filePath.startsWith("Dropbox");

    if (isRemote) {
      return NextResponse.json({
        valid: record.status === "COMPLETED",
        size: Math.round(record.fileSize * 1024 * 1024),
      });
    }

    // Local backups — check file exists on disk and has non-zero size
    const filename = record.filePath;
    const filePath = filename.startsWith("/") ? filename : join(BACKUP_DIR, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json({ valid: false, size: 0 });
    }

    const stat = statSync(filePath);
    return NextResponse.json({
      valid: stat.size > 0,
      size: stat.size,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Backup verify error:", error);
    return NextResponse.json({ error: "Failed to verify backup" }, { status: 500 });
  }
}
