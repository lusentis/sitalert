import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sitalert/shared", "@sitalert/db"],
  webpack: (config) => {
    // Resolve .js imports to .ts files in internal packages
    // (TypeScript ESM convention uses .js extensions in source imports)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
