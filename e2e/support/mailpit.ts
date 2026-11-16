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
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`,
    );
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MensajeMailpit[] };
      for (const mensaje of messages) {
        const codigo = /\b(\d{6})\b/.exec(mensaje.Subject)?.[1];
        if (codigo && new Date(mensaje.Created) >= desde) return codigo;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No llegó a Mailpit el código para ${email}`);
}
