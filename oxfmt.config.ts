import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["src/__tests__/fixtures/**"],
  sortImports: true,
  sortProperties: true,
});
