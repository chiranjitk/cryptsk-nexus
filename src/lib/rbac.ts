import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PermissionAction } from "@prisma/client";

// ============================================================
// CRYPTSK Nexus — RBAC Middleware
// Per: docs/architecture/08_SECURITY_RBAC_SPECIFICATION.md
// Model: User → Role → Permission → Resource+Action → Scope
// Permission verbs: read, list, create, update, delete,
//                  approve, execute, export, manage
// ============================================================

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};

/** Get the current authenticated user from the session */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const user = session.user as any;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles || [],
    permissions: user.permissions || [],
  };
}

/** Require authentication — redirects to / if not logged in */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

/** Check if user has a specific permission (e.g. "subscriber.read") */
export function hasPermission(user: AuthUser, resource: string, action: PermissionAction): boolean {
  // Super Administrator always has all permissions
  if (user.roles.includes("Super Administrator")) return true;
  // Check explicit permission
  const key = `${resource}.${action}`;
  return user.permissions.includes(key);
}

/** Check if user has any of the specified permissions */
export function hasAnyPermission(user: AuthUser, permissions: { resource: string; action: PermissionAction }[]): boolean {
  if (user.roles.includes("Super Administrator")) return true;
  return permissions.some((p) => user.permissions.includes(`${p.resource}.${p.action}`));
}

/** Require a specific permission — returns 403 if denied */
export async function requirePermission(
  resource: string,
  action: PermissionAction
): Promise<AuthUser> {
  const user = await requireAuth();

  if (!hasPermission(user, resource, action)) {
    // Log the denied access. Never let audit failures change the response —
    // e.g. a Self-Care portal (customer) session has a portal_users id here,
    // which is not a staff users FK, so the insert can legitimately fail.
    try {
      await db.auditEvent.create({
        data: {
          userId: user.id,
          action: "execute",
          resource: resource,
          result: "denied",
          errorMessage: `Permission denied: ${resource}.${action}`,
          ipAddress: "server",
        },
      });
    } catch (err) {
      console.error("[rbac] failed to audit denied access:", err);
    }

    // Throw a 403
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return user;
}

/** Check if user has a specific role (e.g. "Super Administrator") */
export function hasRole(user: AuthUser, roleName: string): boolean {
  return user.roles.includes(roleName);
}

/** Check if user has any of the specified roles */
export function hasAnyRole(user: AuthUser, roleNames: string[]): boolean {
  return roleNames.some((r) => user.roles.includes(r));
}

/** Require a specific role */
export async function requireRole(roleName: string): Promise<AuthUser> {
  const user = await requireAuth();
  if (!hasRole(user, roleName)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

// Client-side permission check (for use in 'use client' components)
export function canClient(
  permissions: string[] | undefined,
  roles: string[] | undefined,
  resource: string,
  action: PermissionAction
): boolean {
  if (roles?.includes("Super Administrator")) return true;
  return permissions?.includes(`${resource}.${action}`) || false;
}
