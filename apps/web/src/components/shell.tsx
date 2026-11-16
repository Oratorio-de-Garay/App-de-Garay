import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, LogOut, Menu, ShieldCheck, Store, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PRODUCCION_DESDE_LOCAL } from "@/config";
import { cerrarSesion, useSesion } from "@/features/auth/sesion";
import { AvisoDePush, BotonInstalar } from "@/features/push/avisos";
import { formatoHoy } from "@/lib/formato";
import { cn } from "@/lib/utils";

// Marco de la app: menú lateral (en el celular, un panel que se abre con el
// botón de menú) y encabezado. Antes este bloque estaba copiado en cada HTML.

const SECCIONES = [
  {
    ruta: "/",
    titulo: "Registro",
    encabezado: "Registro de ingreso",
    Icono: ClipboardCheck,
    requiere: "organizacion",
  },
  { ruta: "/buffet", titulo: "Buffet", encabezado: "Buffet", Icono: Store, requiere: "organizacion" },
  {
    ruta: "/admin",
    titulo: "Administración",
    encabezado: "Administración",
    Icono: ShieldCheck,
    requiere: "admin",
  },
] as const;

function Menu_({ alNavegar }: { alNavegar?: () => void }) {
  const { yo, organizacionId, cambiarOrganizacion } = useSesion();
  const ruta = useRouterState({ select: (estado) => estado.location.pathname });
  const enAdmin = ruta.startsWith("/admin");

  // Sin organización (superadmin puro) no tiene sentido mostrar Registro ni
  // Buffet; "Administración" es sólo para quien administra algo.
  const visibles = SECCIONES.filter((seccion) =>
    seccion.requiere === "admin" ? yo.puede_administrar : yo.organizations.length > 0,
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <img src="/icon.svg" alt="" className="size-10 rounded-xl ring-1 ring-white/15" />
        <div className="min-w-0">
          <div className="truncate leading-tight font-bold text-white">Oratorio de Garay</div>
          <div className="truncate text-xs text-sidebar-muted">{yo.email}</div>
        </div>
      </div>

      <nav className="grid gap-1 px-3" aria-label="Secciones">
        {visibles.map(({ ruta: destino, titulo, Icono }) => (
          <Link
            key={destino}
            to={destino}
            onClick={alNavegar}
            activeOptions={{ exact: destino === "/" }}
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-white"
            activeProps={{ className: "bg-sidebar-accent text-white", "aria-current": "page" }}
          >
            <Icono className="size-[18px]" aria-hidden />
            {titulo}
          </Link>
        ))}
      </nav>

      <div className="mt-auto grid gap-2 px-3 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* En el panel se trabaja sobre todas las organizaciones que se administran. */}
        {yo.organizations.length > 1 && !enAdmin && (
          <label className="grid gap-1 px-2 text-xs text-sidebar-muted">
            Organización
            <select
              className="h-10 rounded-lg border border-white/15 bg-sidebar-accent px-2 text-sm font-medium text-white"
              value={organizacionId ?? ""}
              onChange={(e) => {
                cambiarOrganizacion(e.target.value);
                alNavegar?.();
              }}
            >
              {yo.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <BotonInstalar className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" />
        <Button
          variant="ghost"
          className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          onClick={() => void cerrarSesion()}
        >
          <LogOut aria-hidden />
          Salir
        </Button>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ruta = useRouterState({ select: (estado) => estado.location.pathname });
  const seccion = SECCIONES.find((s) => (s.ruta === "/" ? ruta === "/" : ruta.startsWith(s.ruta)));

  useEffect(() => {
    document.title = seccion ? `${seccion.titulo} · Oratorio de Garay` : "Oratorio de Garay";
  }, [seccion]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {PRODUCCION_DESDE_LOCAL && (
        <div
          role="alert"
          className="sticky top-0 z-40 bg-destructive px-4 py-1.5 text-center text-sm font-semibold text-white"
        >
          ⚠️ Base de PRODUCCIÓN: todo lo que hagas modifica datos reales.
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Menu_ />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:h-16 lg:px-8">
        <DialogPrimitive.Root open={menuAbierto} onOpenChange={setMenuAbierto}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Abrir menú">
              <Menu aria-hidden />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-900/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
            <DialogPrimitive.Content
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left"
              aria-describedby={undefined}
            >
              <DialogPrimitive.Title className="sr-only">Menú</DialogPrimitive.Title>
              <Menu_ alNavegar={() => setMenuAbierto(false)} />
              <DialogPrimitive.Close
                className="absolute top-4 right-3 flex size-9 items-center justify-center rounded-full text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="Cerrar menú"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="min-w-0">
          <div className="truncate leading-tight font-bold lg:text-lg">
            {seccion?.encabezado ?? "Oratorio de Garay"}
          </div>
          <div className="text-xs text-muted-foreground first-letter:uppercase">{formatoHoy()}</div>
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-5xl px-4 py-5 lg:px-8 lg:py-7")}>{children}</main>
      <AvisoDePush />
    </div>
  );
}
