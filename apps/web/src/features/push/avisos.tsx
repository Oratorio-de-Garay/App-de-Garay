import { BellRing, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { mensajeDeError } from "@/lib/api";
import {
  activarPush,
  correspondeAvisarPush,
  posponerAvisoDePush,
  registrarServiceWorker,
  sincronizarPush,
} from "./push";

/**
 * Ofrece activar las notificaciones a quien tiene sesión y no las activó, una
 * vez por carga de la app. Sólo se monta dentro de la app, nunca en el login.
 */
export function AvisoDePush() {
  const [visible, setVisible] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    void sincronizarPush();
    // Un respiro para no tapar la pantalla recién cargada.
    const id = setTimeout(async () => setVisible(await correspondeAvisarPush()), 1500);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Activar notificaciones"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-xl animate-in slide-in-from-bottom-4 fade-in"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <BellRing className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">¿Querés recibir notificaciones?</p>
        <p className="text-sm text-muted-foreground">Te avisamos de lo importante en este dispositivo.</p>
      </div>
      <div className="flex w-full justify-end gap-2 sm:w-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            posponerAvisoDePush();
            setVisible(false);
          }}
        >
          Ahora no
        </Button>
        <Button
          size="sm"
          cargando={activando}
          onClick={async () => {
            setActivando(true);
            try {
              await activarPush();
              toast.success("Listo: este dispositivo recibirá notificaciones.");
            } catch (error) {
              // Rechazó el permiso del navegador, o falló el registro.
              posponerAvisoDePush();
              toast.error(mensajeDeError(error));
            } finally {
              setVisible(false);
            }
          }}
        >
          Activar
        </Button>
      </div>
    </div>
  );
}

interface EventoDeInstalacion extends Event {
  prompt: () => void;
  userChoice: Promise<unknown>;
}

const yaInstalada = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Instalar como app".
 * - Chrome/Edge/Android: captura `beforeinstallprompt` y lo dispara al tocar.
 * - iOS (Safari): no existe esa API, así que explica cómo agregarla.
 * - Si ya está instalada o el navegador no puede, no aparece.
 */
export function BotonInstalar({ className }: { className?: string }) {
  const [evento, setEvento] = useState<EventoDeInstalacion | null>(null);
  const [instalada, setInstalada] = useState(yaInstalada);
  const ios = esIOS();

  useEffect(() => {
    if (instalada) return;
    if ("serviceWorker" in navigator) registrarServiceWorker().catch(() => {});
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoDeInstalacion);
    };
    const alInstalar = () => setInstalada(true);
    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, [instalada]);

  if (instalada || (!evento && !ios)) return null;

  return (
    <Button
      variant="ghost"
      className={className}
      onClick={async () => {
        if (!evento) {
          toast.info(
            "Para instalar la app: tocá Compartir en Safari y elegí «Agregar a pantalla de inicio».",
            {
              duration: 8000,
            },
          );
          return;
        }
        evento.prompt();
        await evento.userChoice.catch(() => {});
        setEvento(null);
      }}
    >
      <Download aria-hidden />
      Instalar como app
    </Button>
  );
}
