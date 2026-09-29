import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { auditLogin } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — NextAuth v4 Configuration
// Per: docs/architecture/08_SECURITY_RBAC_SPECIFICATION.md
// - bcryptjs password hashing
// - HMAC-SHA256 session tokens (NextAuth default)
// - Secure cookies (cryptsk_session)
// - JWT session strategy (stateless, no DB session store needed)
// - Credentials provider (email + password)
//
// Two account kinds share this login (single login form):
//   • staff     → users table, roles + permissions (RBAC)
//   • customer  → portal_users table (Self-Care portal), strictly
//                 scoped to their own customer's data via
//                 requireSelfcareAccess() — never any staff permission
// The lookup falls back portal-ward only when the staff user is not
// found, so staff authentication behavior is unchanged.
// ============================================================

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();
        const ip = req?.headers?.["x-forwarded-for"]?.toString() || "unknown";

        // Find user
        const user = await db.user.findUnique({
          where: { email },
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        });

        // ------------------------------------------------------
        // Customer Self-Care portal login (portal_users table).
        // Reached only when no staff user matches the email — the
        // staff path above/below stays byte-for-byte identical.
        // auditLogin userId stays null: audit_events.user_id is an FK
        // to the staff users table, so portal logins are identified
        // by email (resourceName) instead.
        // ------------------------------------------------------
        if (!user) {
          const portalUser = await db.portalUser.findUnique({
            where: { email },
            include: { customer: { select: { displayName: true } } },
          });

          if (!portalUser) {
            await auditLogin({ userId: null, email, ip, success: false, errorMessage: "user not found" });
            return null;
          }

          // Portal account must be active (staff can disable it)
          if (portalUser.status !== "active") {
            await auditLogin({ userId: null, email, ip, success: false, errorMessage: "account disabled" });
            return null;
          }

          // Check if portal account is locked
          if (portalUser.lockedUntil && portalUser.lockedUntil > new Date()) {
            await auditLogin({ userId: null, email, ip, success: false, errorMessage: "account locked" });
            return null;
          }

          // Verify password (mirror of staff lockout: 5 attempts → 15 min)
          const portalValid = await bcrypt.compare(credentials.password, portalUser.passwordHash);
          if (!portalValid) {
            const attempts = portalUser.loginAttempts + 1;
            const lockDuration = attempts >= 5 ? 15 * 60 * 1000 : null;

            await db.portalUser.update({
              where: { id: portalUser.id },
              data: {
                loginAttempts: attempts,
                lockedUntil: lockDuration ? new Date(Date.now() + lockDuration) : null,
              },
            });

            await auditLogin({ userId: null, email, ip, success: false, errorMessage: "invalid password" });
            return null;
          }

          // Success — reset counters + stamp last login
          await db.portalUser.update({
            where: { id: portalUser.id },
            data: {
              loginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
              lastLoginIp: ip,
            },
          });

          await auditLogin({ userId: null, email, ip, success: true });

          return {
            id: portalUser.id,
            email: portalUser.email,
            name: portalUser.name || portalUser.customer.displayName,
            userType: "customer",
            customerId: portalUser.customerId,
            customerName: portalUser.customer.displayName,
          } as any;
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await auditLogin({ userId: user.id, email, ip, success: false, errorMessage: "account locked" });
          return null;
        }

        // Check if account is active
        if (user.status !== "active") {
          await auditLogin({ userId: user.id, email, ip, success: false, errorMessage: `account ${user.status}` });
          return null;
        }

        // Verify password
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          // Increment failed login attempts
          const attempts = user.loginAttempts + 1;
          const lockDuration = attempts >= 5 ? 15 * 60 * 1000 : null; // lock 15min after 5 attempts

          await db.user.update({
            where: { id: user.id },
            data: {
              loginAttempts: attempts,
              failedLoginAt: new Date(),
              lockedUntil: lockDuration ? new Date(Date.now() + lockDuration) : null,
            },
          });

          await auditLogin({ userId: user.id, email, ip, success: false, errorMessage: "invalid password" });
          return null;
        }

        // Success — reset counters
        await db.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });

        await auditLogin({ userId: user.id, email, ip, success: true });

        // Return user object (will be in JWT token) — staff
        return {
          id: user.id,
          email: user.email,
          name: user.name || user.username,
          userType: "staff",
          roles: user.roles.map((ur) => ur.role.name),
          permissions: user.roles.flatMap((ur) =>
            ur.role.permissions.map((rp) => `${rp.permission.resource}.${rp.permission.action}`)
          ),
        } as any;
      },
    }),
  ],

  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 hours

  jwt: {
    maxAge: 8 * 60 * 60, // 8 hours
  },

  cookies: {
    sessionToken: {
      name: "cryptsk_session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // Secure only when HTTPS is configured (Caddy TLS in Phase 1+)
        // For now: HTTP on prod VM, so secure=false
        secure: process.env.NEXTAUTH_URL?.startsWith("https") ?? false,
      },
    },
  },

  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign-in — branch on account kind
      if (user) {
        if ((user as any).userType === "customer") {
          // Customer portal session — token.id = portalUser.id
          token.userType = "customer";
          token.id = user.id;
          token.customerId = (user as any).customerId;
          token.customerName = (user as any).customerName;
        } else {
          // Staff session (default — also covers legacy tokens w/o userType)
          token.userType = "staff";
          token.id = user.id;
          token.roles = (user as any).roles || [];
          token.permissions = (user as any).permissions || [];
        }
      }

      // Refresh data on session update
      if (trigger === "update") {
        if (token.userType === "customer") {
          // Re-fetch the portal user (token.id = portalUser.id).
          // Only display fields are refreshed here — if the account was
          // disabled since login the token is left as-is and the API
          // route guard (requireSelfcareAccess) re-checks DB status → 403.
          const portalUser = await db.portalUser.findUnique({
            where: { id: token.id as string },
            include: { customer: { select: { displayName: true } } },
          });
          if (portalUser && portalUser.customerId === token.customerId) {
            token.name = portalUser.name || portalUser.customer.displayName;
            token.customerName = portalUser.customer.displayName;
          }
        } else {
          const dbUser = await db.user.findUnique({
            where: { id: token.id as string },
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          });
          if (dbUser) {
            token.roles = dbUser.roles.map((ur) => ur.role.name);
            token.permissions = dbUser.roles.flatMap((ur) =>
              ur.role.permissions.map((rp) => `${rp.permission.resource}.${rp.permission.action}`)
            );
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const userType = (token.userType as string | undefined) ?? "staff";
        (session.user as any).userType = userType;
        (session.user as any).id = token.id;
        if (userType === "customer") {
          // Customer portal session — no roles/permissions ever leave
          (session.user as any).customerId = token.customerId;
          (session.user as any).customerName = token.customerName;
        } else {
          // Staff — identical shape to before, plus additive userType
          (session.user as any).roles = token.roles;
          (session.user as any).permissions = token.permissions;
        }
      }
      return session;
    },
  },

  pages: {
    // We use an AuthGate pattern — login renders at / when unauthenticated
    // No custom login route needed
    signIn: "/",
    error: "/",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
