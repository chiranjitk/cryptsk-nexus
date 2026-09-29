import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { requireAuth, AuthError } from "@/lib/api-auth";

const UPLOAD_BASE = path.join(process.cwd(), "uploads");

// Common MIME types
const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

// GET /api/files?path=subscribers/profile/abc.jpg — serve uploaded files
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    // Security: prevent directory traversal
    const resolved = path.resolve(UPLOAD_BASE, filePath);
    if (!resolved.startsWith(UPLOAD_BASE)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
    }

    // Check file exists
    const fileStat = await stat(resolved).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const buffer = await readFile(resolved);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[Files] Error:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
