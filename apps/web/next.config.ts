import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  transpilePackages: ["@travelrisk/shared", "@travelrisk/db"],
};

export default nextConfig;
