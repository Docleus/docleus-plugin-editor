import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const PORT = 4319;
const bundle = fileURLToPath(new URL("tests/e2e/bundle.yaml", import.meta.url));
const data = mkdtempSync(join(tmpdir(), "docleus-e2e-"));

// The server loads the built app and the built plugins of both repositories,
// so the command builds them first.
const command = [
  "pnpm --dir ../docleus-core build",
  "pnpm build",
  "pnpm --dir ../docleus-plugin-blocks-commonmark build",
  `pnpm --dir ../docleus-core docleus serve --dev --bundle ${bundle} --data ${data} --port ${PORT}`,
].join(" && ");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command,
    url: `http://127.0.0.1:${PORT}/api/auth/methods`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
