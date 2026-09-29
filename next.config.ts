import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Preview panel serves the app from https://preview-*.space-z.ai — allow the
  // dev server to serve /_next assets cross-origin to those hosts.
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
