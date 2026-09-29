import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai"],
  // ─── Treat native/binary Node modules as externals ───────────
  // ssh2 / net-snmp / ros-client / pg use binary assets that Turbopack
  // cannot bundle into ESM chunks. Marking them as server external
  // packages keeps them as require()'d Node modules in the standalone
  // server bundle, which is the only mode that works for them.
  serverExternalPackages: [
    "ssh2",
    "net-snmp",
    "ros-client",
    "pg",
    "pg-native",
    "bcryptjs",
    "nodemailer",
    "@prisma/client",
  ],
  // ─── Webpack 5 (NOT Turbopack) for production builds ─────────
  // The v1 codebase has 200+ API routes that mix server-only Node
  // modules (ssh2, net-snmp, ros-client) with browser-side React.
  // Webpack 5 handles this better than Turbopack on Next 16.
  // The dev script uses Turbopack (faster HMR); production uses webpack.
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Native modules shouldn't be bundled
      config.externals = config.externals || [];
      ["ssh2", "net-snmp", "ros-client", "pg-native", "bcrypt"].forEach(
        (pkg) => {
          config.externals.push({ [pkg]: `commonjs ${pkg}` });
        }
      );
    }
    return config;
  },
};

export default nextConfig;
