import { createClient } from "@supabase/supabase-js";
import { config } from "@/config";

// Supabase se usa en el navegador SÓLO para la sesión (Google o código por
// mail). Los datos se piden siempre a /api, nunca directo a la base.
export const supabase = createClient(config.supabaseUrl, config.supabaseKey);
