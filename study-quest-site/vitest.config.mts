import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.mts"], environment: "node", testTimeout: 30000 } });
