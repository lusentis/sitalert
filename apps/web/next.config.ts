import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@travelrisk/shared", "@travelrisk/db"],
};

export default nextConfig;
