import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, E2E_URL } from "./e2e/support/entorno";

// Tests de punta a punta contra la app corriendo con la base LOCAL
// (npx supabase start). Ver docs/TESTING.md.
export default defineConfig({
  testDir: "./e2e",
  // Los tests comparten una base: en serie para que no se pisen.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalTeardown: "./e2e/support/limpieza.ts",
  use: {
    baseURL: E2E_URL,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] }, grep: /@celular/ },
  ],
  webServer: {
    // Compila la app y la sirve junto con la API en un solo puerto, como en producción.
    command: "npm run build -w @garay/web && npx tsx --env-file=.env.local apps/api/src/server.ts",
    url: `${E2E_URL}/api/health`,
    env: { PORT: String(E2E_PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
