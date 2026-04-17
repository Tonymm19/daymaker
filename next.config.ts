import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained .next/standalone bundle (server.js + trimmed
  // node_modules). Cloud Run copies this directly — no npm install at runtime.
  output: 'standalone',
};

export default nextConfig;
