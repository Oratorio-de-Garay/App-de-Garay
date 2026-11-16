import { existsSync } from "node:fs";
import path from "node:path";

// Variables de la base LOCAL. Se leen del mismo archivo que usa el server.
const ENV_FILE = path.resolve(process.cwd(), ".env.local");
if (!process.env.SUPABASE_URL && existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta ${nombre}. Los tests leen .env.local (ver docs/TESTING.md).`);
  }
  return valor;
}

export const SUPABASE_URL = requerida("SUPABASE_URL");
export const SUPABASE_KEY = requerida("SUPABASE_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = requerida("SUPABASE_SERVICE_ROLE_KEY");

// Los e2e crean y borran datos: jamás contra una base que no sea la local.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SUPABASE_URL)) {
  throw new Error(`Los e2e sólo corren contra la base local; SUPABASE_URL apunta a ${SUPABASE_URL}.`);
}

export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
export const E2E_URL = `http://localhost:${E2E_PORT}`;
export const MAILPIT_URL = process.env.MAILPIT_URL || "http://127.0.0.1:54324";

// Usuarios de supabase/seed.sql.
export const USUARIOS = {
  admin: "admin@local.test",
  miembro: "miembro@local.test",
  sinAcceso: "nuevo@local.test",
  /** Lo crean las migraciones. En local entra con código, como cualquiera. */
  superadmin: "oratoriogarayy@gmail.com",
} as const;

// Todo lo que crean los tests lleva esta marca, para poder limpiarlo.
export const MARCA = "E2E";
export const marcaUnica = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
