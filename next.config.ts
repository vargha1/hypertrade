import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set the workspace root to silence the multi-lockfile warning
    root: __dirname,
  },
};

export default nextConfig;
