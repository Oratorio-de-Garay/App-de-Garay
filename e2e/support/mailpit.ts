import { MAILPIT_URL } from "./entorno";

interface MensajeMailpit {
  ID: string;
  Subject: string;
  Created: string;
  To: { Address: string }[];
}

/**
 * Espera el mail con el código de acceso que Supabase Auth manda a Mailpit y
 * devuelve sus 6 dígitos. `desde` descarta códigos de logins anteriores.
 */
export async function esperarCodigo(email: string, desde: Date, timeoutMs = 15_000): Promise<string> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MensajeMailpit[] };
      const mensaje = messages.find((m) => new Date(m.Created) >= desde && /\b\d{6}\b/.test(m.Subject));
      if (mensaje) return mensaje.Subject.match(/\b(\d{6})\b/)![1];
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No llegó a Mailpit el código para ${email}`);
}
