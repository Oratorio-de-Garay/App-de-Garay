import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EsqueletoDeLista } from "@/components/ui/varios";
import { Login, PantallaDeAcceso } from "@/features/auth/login";
import { Registro } from "@/features/auth/registro";
import { useEstadoDeSesion, useSesion } from "@/features/auth/sesion";
import { tomarRetorno } from "@/lib/almacen";

// ─────────────────────────────────────────────────────────
// Raíz: decide qué se ve según la sesión. Hasta que la API confirma el acceso
// no se monta nada de la app (ni el menú ni las pantallas).
// ─────────────────────────────────────────────────────────

function Raiz() {
  const sesion = useEstadoDeSesion();

  if (sesion.tipo === "cargando") {
    return (
      <PantallaDeAcceso>
        <p className="text-center font-semibold" role="status">
          Verificando tu acceso…
        </p>
      </PantallaDeAcceso>
    );
  }
  if (sesion.tipo === "sin-sesion") return <Login />;
  if (sesion.tipo === "sin-acceso") return <Registro />;
  if (sesion.tipo === "error") {
    return (
      <PantallaDeAcceso>
        <h1 className="text-xl font-bold">Error de conexión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No se pudo verificar tu acceso. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button className="mt-4 w-full" onClick={sesion.reintentar}>
          Reintentar
        </Button>
      </PantallaDeAcceso>
    );
  }
  return <Aplicacion />;
}

function Aplicacion() {
  const { yo } = useSesion();
  const router = useRouter();
  const navigate = useNavigate();
  const ruta = useRouterState({ select: (estado) => estado.location.pathname });
  const retornoRevisado = useRef(false);

  // Recién logueado desde un link (ej: el de una solicitud en un mail): Google
  // vuelve a la raíz, así que acá se lo lleva a donde quería ir.
  useEffect(() => {
    if (retornoRevisado.current) return;
    retornoRevisado.current = true;
    const retorno = tomarRetorno();
    if (retorno && retorno !== location.pathname + location.search) router.history.replace(retorno);
  }, [router]);

  const enAdmin = ruta.startsWith("/admin");
  const sinPermiso = enAdmin && !yo.puede_administrar;
  // Sin organizaciones no hay datos que mostrar: un superadmin sólo usa el panel.
  const sinOrganizacion = !enAdmin && yo.organizations.length === 0;

  useEffect(() => {
    if (sinPermiso) {
      toast.error("No tenés permisos de administración.");
      void navigate({ to: "/", replace: true });
    } else if (sinOrganizacion) {
      void navigate({ to: "/admin", replace: true });
    }
  }, [sinPermiso, sinOrganizacion, navigate]);

  return <Shell>{sinPermiso || sinOrganizacion ? null : <Outlet />}</Shell>;
}

const raiz = createRootRoute({ component: Raiz });

const cargando = () => <EsqueletoDeLista />;

const asistencia = createRoute({
  getParentRoute: () => raiz,
  path: "/",
  validateSearch: z.object({
    /** Ficha abierta. */
    pibe: z.string().optional(),
    vista: z.enum(["historial", "nuevo"]).optional(),
    anio: z.coerce.number().int().optional(),
    /** Día del historial abierto (AAAA-MM-DD). */
    fecha: z.string().optional(),
  }),
  component: lazyRouteComponent(() => import("@/features/asistencia/pagina"), "PaginaDeAsistencia"),
  pendingComponent: cargando,
});

const buffet = createRoute({
  getParentRoute: () => raiz,
  path: "/buffet",
  validateSearch: z.object({
    tab: z.enum(["productos", "ventas", "combos", "presupuestos"]).optional(),
    /** Evento abierto en la pestaña Ventas. */
    evento: z.string().optional(),
  }),
  component: lazyRouteComponent(() => import("@/features/buffet/pagina"), "PaginaDeBuffet"),
  pendingComponent: cargando,
});

const admin = createRoute({
  getParentRoute: () => raiz,
  path: "/admin",
  validateSearch: z.object({
    tab: z.string().optional(),
    /** Solicitud a abrir (link de un mail). */
    solicitud: z.string().optional(),
  }),
  component: lazyRouteComponent(() => import("@/features/admin/pagina"), "PaginaDeAdmin"),
  pendingComponent: cargando,
});

/** Las direcciones de antes de la migración (y las de los mails ya enviados). */
const direccionAnterior = (archivo: string, destino: "/" | "/buffet" | "/admin") =>
  createRoute({
    getParentRoute: () => raiz,
    path: archivo,
    beforeLoad: ({ location }) => {
      throw redirect({ to: destino, search: location.search as never, replace: true });
    },
  });

const arbol = raiz.addChildren([
  asistencia,
  buffet,
  admin,
  direccionAnterior("/index.html", "/"),
  direccionAnterior("/buffet.html", "/buffet"),
  direccionAnterior("/admin.html", "/admin"),
]);

export const router = createRouter({
  routeTree: arbol,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultNotFoundComponent: () => (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">Esta página no existe</p>
      <Button asChild className="mt-4">
        <a href="/">Ir al inicio</a>
      </Button>
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
