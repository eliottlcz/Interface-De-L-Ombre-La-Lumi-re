import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { launchOptions: { executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] }, baseURL: process.env.E2E_URL ?? "http://localhost:3100", locale: "fr-FR", timezoneId: "Europe/Paris", trace: "off" },
});
