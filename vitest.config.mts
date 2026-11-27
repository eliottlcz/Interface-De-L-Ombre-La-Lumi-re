import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": r("./src"), "server-only": r("./tests/stubs/server-only.ts") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node", env: { VAULT_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"), TZ: "UTC" } },
});
