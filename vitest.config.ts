import { defineConfig } from "vitest/config";

// Dos clases de tests (ver docs/TESTING.md):
//   - unitarios (`*.test.ts`): sin base ni red. `npm test`.
//   - integración (`*.integration.test.ts`): la API contra la base LOCAL.
//     `npm run test:integration`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "api",
          include: ["apps/api/src/**/*.test.ts"],
          environment: "node",
          // Valores de mentira: alcanzan para importar los módulos (env.ts
          // exige las variables), pero ningún test unitario sale a la red.
          env: {
            SUPABASE_URL: "http://127.0.0.1:54321",
            SUPABASE_KEY: "clave-publica-de-prueba",
            SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio-de-prueba",
            CRON_SECRET: "",
            VAPID_PUBLIC_KEY: "",
            VAPID_PRIVATE_KEY: "",
            SMTP_HOST: "",
            APP_URL: "",
          },
        },
      },
      {
        test: {
          name: "integracion",
          include: ["apps/api/test/**/*.integration.test.ts"],
          environment: "node",
          setupFiles: ["apps/api/test/preparar.ts"],
          // Comparten la base: de a un archivo por vez.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
