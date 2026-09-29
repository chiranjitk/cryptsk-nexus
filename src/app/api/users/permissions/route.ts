import { requirePermission, AuthError } from "@/lib/api-auth";
import { ROLE_PERMISSIONS } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "users.read");

    // Extract all unique permissions across all roles
    const allPermissionsSet = new Set<string>();
    const roles = Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>;

    for (const role of roles) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        // Strip the :own suffix for the permission column (just the base permission)
        const basePerm = perm.split(":")[0];
        allPermissionsSet.add(basePerm);
      }
    }

    const permissions = Array.from(allPermissionsSet).sort();

    // Build the matrix: role -> { permission: boolean }
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const role of roles) {
      matrix[role] = {};
      for (const perm of permissions) {
        // Check exact match or own-scope match
        const rolePerms = ROLE_PERMISSIONS[role];
        matrix[role][perm] =
          rolePerms.includes(perm) ||
          rolePerms.includes(`${perm}:own`) ||
          rolePerms.includes(`${perm.split(".")[0]}.*`);
      }
    }

    return NextResponse.json({
      roles,
      permissions,
      matrix,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Permissions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}
