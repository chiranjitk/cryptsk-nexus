import { db } from "@/lib/db";

// ============================================================
// CRYPTSK Nexus — Role → permission resolver with in-memory cache.
//
// WHY THIS EXISTS (T11 hotfix): the NextAuth session JWT used to embed
// the full permission list (336+ entries ≈ 8KB of JWE). NextAuth chunks
// the cookie at ~4KB, so login responses carried 3 chunked
// `cryptsk_session.N` Set-Cookie headers and the preview panel's edge
// gateway rejected the whole response with
//   502 "response header size exceeds limit '8192' bytes"
// → the browser's signIn() got JSON without a `url` field and crashed
// with "Failed to construct 'URL': Invalid URL".
//
// The JWT now stores role NAMES only; permissions are resolved here
// (DB + 60s in-memory cache) inside the auth session() callback, so the
// external session contract (session.user.permissions) is unchanged.
// ============================================================

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; permissions: string[] }>();

/** Resolve `resource.action` permission keys for the given role names. */
export async function resolvePermissionsForRoles(roleNames: string[]): Promise<string[]> {
  if (!roleNames || roleNames.length === 0) return [];

  const key = [...roleNames].sort().join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.permissions;

  const rows = await db.role.findMany({
    where: { name: { in: roleNames } },
    include: { permissions: { include: { permission: true } } },
  });

  const permissions = [
    ...new Set(
      rows.flatMap((r) =>
        r.permissions.map((rp) => `${rp.permission.resource}.${rp.permission.action}`)
      )
    ),
  ];

  cache.set(key, { at: Date.now(), permissions });
  return permissions;
}
