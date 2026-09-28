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

        if (!user) {
          await auditLogin({ userId: null, email, ip, success: false, errorMessage: "user not found" });
          return null;
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

        // Return user object (will be in JWT token)
        return {
          id: user.id,
          email: user.email,
          name: user.name || user.username,
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
      // Initial sign-in
      if (user) {
        token.id = user.id;
        token.roles = (user as any).roles || [];
        token.permissions = (user as any).permissions || [];
      }

      // Refresh role data on session update
      if (trigger === "update") {
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

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).roles = token.roles;
        (session.user as any).permissions = token.permissions;
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
