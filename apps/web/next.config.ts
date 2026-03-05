import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@travelrisk/shared", "@travelrisk/db"],
};

export default nextConfig;
