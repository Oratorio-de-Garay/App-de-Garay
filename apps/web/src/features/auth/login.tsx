import type { AuthError } from "@supabase/supabase-js";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/campos";
import { Card } from "@/components/ui/varios";
import { config } from "@/config";
import { guardarRetorno } from "@/lib/almacen";
import { supabase } from "@/lib/supabase";

/** Segundos de espera antes de poder pedir otro código. */
const ESPERA_REENVIO = 60;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Traduce los errores de Supabase Auth a algo que la persona pueda resolver. */
export function mensajeDeAuth(error: Pick<AuthError, "status" | "code" | "message">): string {
  const texto = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.status === 429 || texto.includes("rate") || texto.includes("security purposes")) {
    return "Pediste demasiados códigos seguidos. Esperá un minuto y probá de nuevo.";
  }
  if (texto.includes("expired") || texto.includes("invalid") || texto.includes("otp")) {
    return "El código no es válido o ya venció. Revisalo o pedí uno nuevo.";
  }
  if (texto.includes("signup") || texto.includes("not allowed")) {
    return "No se pueden crear cuentas nuevas en este momento.";
  }
  return "No se pudo completar. Revisá tu conexión e intentá de nuevo.";
}

/** Marco de las pantallas de afuera de la app (login, registro, errores). */
export function PantallaDeAcceso({ children, ancha }: { children: ReactNode; ancha?: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-900 to-brand-700 p-4">
      <div className="mb-5 flex items-center gap-3 text-white">
        <img src="/icon.svg" alt="" className="size-11 rounded-xl ring-1 ring-white/20" />
        <div>
          <div className="text-lg leading-tight font-bold">Oratorio de Garay</div>
          <div className="text-sm text-brand-200">Registro de ingreso y buffet</div>
        </div>
      </div>
      <Card className={`w-full p-6 shadow-xl sm:p-7 ${ancha ? "max-w-lg" : "max-w-sm"}`}>{children}</Card>
    </main>
  );
}

function rutaActual(): string {
  return location.pathname + location.search;
}

async function enviarCodigo(email: string): Promise<string | null> {
  guardarRetorno(rutaActual());
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? mensajeDeAuth(error) : null;
}

/**
 * Login: Google, o mail + código de 6 dígitos (sin contraseña). Es el mismo
 * flujo para registrarse y para entrar: si la cuenta no existe, Supabase la
 * crea. El acceso lo decide después la API.
 */
export function Login() {
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);
  const [emailInicial, setEmailInicial] = useState("");

  async function conGoogle() {
    guardarRetorno(rutaActual());
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Siempre a la raíz: es lo que seguro está en la lista permitida de
      // Supabase. La página original la restaura guardarRetorno/tomarRetorno.
      options: { redirectTo: `${location.origin}/` },
    });
  }

  return (
    <PantallaDeAcceso>
      <h1 className="text-xl font-bold">Ingresar</h1>
      <p className="mt-1 text-sm text-muted-foreground">Entrá o creá tu cuenta con Google o con tu mail.</p>

      <Button variant="outline" size="lg" className="mt-5 w-full" onClick={conGoogle}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-5">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z" />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
        Continuar con Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o con tu mail
        <span className="h-px flex-1 bg-border" />
      </div>

      {emailEnviado ? (
        <PasoCodigo
          email={emailEnviado}
          alCambiarMail={() => {
            setEmailInicial(emailEnviado);
            setEmailEnviado(null);
          }}
        />
      ) : (
        <PasoMail emailInicial={emailInicial} alEnviar={setEmailEnviado} />
      )}
    </PantallaDeAcceso>
  );
}

function PasoMail({ emailInicial, alEnviar }: { emailInicial: string; alEnviar: (email: string) => void }) {
  const [email, setEmail] = useState(emailInicial);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = email.trim().toLowerCase();
    if (!EMAIL.test(limpio)) return setError("Ingresá un mail válido.");
    setEnviando(true);
    setError("");
    const fallo = await enviarCodigo(limpio);
    setEnviando(false);
    if (fallo) setError(fallo);
    else alEnviar(limpio);
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3">
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="tu@mail.com"
        aria-label="Tu mail"
        aria-invalid={Boolean(error)}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="lg" cargando={enviando}>
        Enviar código
      </Button>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}

function PasoCodigo({ email, alCambiarMail }: { email: string; alCambiarMail: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [restantes, setRestantes] = useState(ESPERA_REENVIO);

  useEffect(() => {
    if (restantes <= 0) return;
    const id = setTimeout(() => setRestantes((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [restantes]);

  async function verificar(evento: FormEvent) {
    evento.preventDefault();
    if (codigo.length !== 6) return setError("El código tiene 6 dígitos.");
    setVerificando(true);
    setError("");
    // Si sale bien, el proveedor de sesión se entera solo y sigue.
    const { error: fallo } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
    if (fallo) {
      setVerificando(false);
      setError(mensajeDeAuth(fallo));
    }
  }

  async function reenviar() {
    setRestantes(ESPERA_REENVIO);
    const fallo = await enviarCodigo(email);
    if (fallo) {
      setError(fallo);
      setRestantes(0);
    } else {
      setError("");
      toast.success("Te mandamos un código nuevo.");
    }
  }

  return (
    <form onSubmit={verificar} noValidate className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Te mandamos un código a <strong className="text-foreground">{email}</strong>.
        {config.baseLocal && (
          <>
            {" "}
            En local llega a{" "}
            <a
              className="text-primary underline"
              href="http://127.0.0.1:54324"
              target="_blank"
              rel="noopener noreferrer"
            >
              Mailpit
            </a>
            .
          </>
        )}
      </p>
      <Input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        aria-label="Código de 6 dígitos"
        aria-invalid={Boolean(error)}
        className="h-14 text-center text-2xl font-semibold tracking-[0.4em]"
        value={codigo}
        // Pegar "123 456" o un código con espacios también sirve.
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <Button type="submit" size="lg" cargando={verificando}>
        Entrar
      </Button>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="link" size="sm" disabled={restantes > 0} onClick={reenviar}>
          {restantes > 0 ? `Reenviar código (${restantes}s)` : "Reenviar código"}
        </Button>
        <Button variant="link" size="sm" onClick={alCambiarMail}>
          Cambiar mail
        </Button>
      </div>
    </form>
  );
}
