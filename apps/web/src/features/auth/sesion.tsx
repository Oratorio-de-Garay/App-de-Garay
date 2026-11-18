import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { guardarOrganizacion, leerOrganizacion, resolverOrganizacion } from "@/lib/almacen";
import { api, ErrorDeApi, pedir, usarOrganizacion } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────
// Sesión y acceso
//
// Hay tres preguntas distintas y cada una tiene su estado:
//   1. ¿Hay sesión de Supabase?            no → "sin-sesion"  (login)
//   2. ¿Ese mail tiene acceso a la app?    no → "sin-acceso"  (pedirlo)
//   3. ¿Sobre qué organización trabaja?    → "lista"
// Lo que se oculta acá es sólo comodidad: el control real lo hace la API.
// ─────────────────────────────────────────────────────────

export interface Yo {
  email: string;
  organizacion_id: string | null;
  organizations: { id: string; name: string }[];
  es_superadmin: boolean;
  organizaciones_admin: string[];
  puede_administrar: boolean;
}

export interface SesionLista {
  tipo: "lista";
  yo: Yo;
  /** Organización activa; null para un superadmin sin membresías. */
  organizacionId: string | null;
  cambiarOrganizacion: (id: string) => void;
}

export type EstadoDeSesion =
  | { tipo: "cargando" }
  | { tipo: "sin-sesion" }
  | { tipo: "sin-acceso"; email: string }
  | { tipo: "error"; reintentar: () => void }
  | SesionLista;

const Contexto = createContext<EstadoDeSesion>({ tipo: "cargando" });

export const cerrarSesion = () => supabase.auth.signOut();

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // undefined: todavía no se sabe si hay sesión.
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  // Elección hecha en esta sesión de la app; sin ella se usa la recordada.
  const [eleccion, setEleccion] = useState<{ usuarioId: string; id: string } | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      if (evento === "SIGNED_OUT") {
        // Sus datos no se heredan. La última organización sí queda recordada
        // (por usuario) para volver a ella al entrar de nuevo.
        setEleccion(null);
        usarOrganizacion(null);
        queryClient.clear();
      }
      // Un refresh del token no cambia quién es: se conserva el mismo objeto
      // para no volver a verificar el acceso.
      setSesion((anterior) => (anterior && nueva && anterior.user.id === nueva.user.id ? anterior : nueva));
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const usuarioId = sesion?.user.id;
  const consulta = useQuery({
    queryKey: ["yo", usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async () => (await pedir(api.auth.me.$get())) as Yo,
    staleTime: 5 * 60_000,
    retry: (intentos, error) =>
      !(error instanceof ErrorDeApi && error.status >= 400 && error.status < 500) && intentos < 2,
  });

  // Token rechazado por la API: se vuelve al login.
  const rechazada = consulta.error instanceof ErrorDeApi && consulta.error.status === 401;
  useEffect(() => {
    if (rechazada) void cerrarSesion();
  }, [rechazada]);

  const cambiarOrganizacion = useCallback(
    (id: string) => {
      if (!usuarioId) return;
      guardarOrganizacion(usuarioId, id);
      setEleccion({ usuarioId, id });
    },
    [usuarioId],
  );

  const estado = useMemo<EstadoDeSesion>(() => {
    if (sesion === undefined) return { tipo: "cargando" };
    if (sesion === null) return { tipo: "sin-sesion" };
    if (consulta.data) {
      const yo = consulta.data;
      // Si la recordada ya no corresponde (le sacaron el acceso, o alguien tocó
      // el localStorage) se usa la que resolvió la API.
      const recordada =
        eleccion && eleccion.usuarioId === usuarioId ? eleccion.id : leerOrganizacion(sesion.user.id);
      const organizacionId = resolverOrganizacion(recordada, yo.organizations, yo.organizacion_id);
      return { tipo: "lista", yo, organizacionId, cambiarOrganizacion };
    }
    if (consulta.error instanceof ErrorDeApi) {
      if (consulta.error.status === 403) return { tipo: "sin-acceso", email: sesion.user.email ?? "" };
      if (consulta.error.status === 401) return { tipo: "cargando" };
    }
    if (consulta.error) return { tipo: "error", reintentar: () => void consulta.refetch() };
    return { tipo: "cargando" };
  }, [sesion, usuarioId, consulta, eleccion, cambiarOrganizacion]);

  // Antes de que los hijos pidan datos: toda consulta lleva esta organización.
  if (estado.tipo === "lista") {
    usarOrganizacion(estado.organizacionId);
    // Ya validada: se deja guardada (y se pisa un valor inválido).
    if (usuarioId && estado.organizacionId && estado.organizacionId !== leerOrganizacion(usuarioId)) {
      guardarOrganizacion(usuarioId, estado.organizacionId);
    }
  }

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}

export const useEstadoDeSesion = () => useContext(Contexto);

/** Dentro de la app (con acceso confirmado). */
export function useSesion(): SesionLista {
  const estado = useContext(Contexto);
  if (estado.tipo !== "lista") throw new Error("useSesion se usa sólo con la sesión lista");
  return estado;
}

/** ¿Administra la organización activa? Sólo comodidad: la API lo vuelve a exigir. */
export function useEsAdminDeLaOrganizacion(): boolean {
  const { yo, organizacionId } = useSesion();
  return organizacionId !== null && yo.organizaciones_admin.includes(organizacionId);
}

/** La organización activa, para las pantallas de datos. */
export function useOrganizacionId(): string {
  const { organizacionId } = useSesion();
  if (!organizacionId) throw new Error("Esta pantalla necesita una organización activa");
  return organizacionId;
}
