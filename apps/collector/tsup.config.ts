import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  // Bundle workspace packages into the output so the runner stage
  // doesn't need to resolve them at runtime
  noExternal: ["@travelrisk/shared", "@travelrisk/db"],
});
