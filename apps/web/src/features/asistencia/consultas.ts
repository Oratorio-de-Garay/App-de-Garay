import { hoyLocal, type PibeConResumen } from "@garay/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganizacionId } from "@/features/auth/sesion";
import { api, ErrorDeApi, pedir } from "@/lib/api";

// Consultas y cambios de la pantalla de asistencia. Todas las claves empiezan
// con la organización: al cambiarla no se mezcla nada, y un cambio invalida
// sólo lo que tocó.

const base = (org: string) => ["org", org] as const;
export const claves = {
  catalogos: (org: string) => [...base(org), "catalogos"] as const,
  pibes: (org: string) => [...base(org), "pibes"] as const,
  busqueda: (org: string, termino: string, fecha: string) =>
    [...base(org), "pibes", "busqueda", termino, fecha] as const,
  pibe: (org: string, id: string) => [...base(org), "pibes", "ficha", id] as const,
  asistencia: (org: string) => [...base(org), "asistencia"] as const,
  presente: (org: string, id: string, fecha: string) =>
    [...base(org), "asistencia", "presente", id, fecha] as const,
  fechas: (org: string, anio: number) => [...base(org), "asistencia", "fechas", anio] as const,
  podio: (org: string, anio: number) => [...base(org), "asistencia", "podio", anio] as const,
  delDia: (org: string, fecha: string) => [...base(org), "asistencia", "dia", fecha] as const,
};

/** Debe coincidir con el límite de GET /api/students/search. */
export const LIMITE_DE_BUSQUEDA = 100;
export const MINIMO_PARA_BUSCAR = 2;

/** Grados y categorías para el alta. Casi no cambian: se piden una vez. */
export function useCatalogos() {
  const org = useOrganizacionId();
  return useQuery({
    queryKey: claves.catalogos(org),
    queryFn: () => pedir(api.lookups.$get()),
    staleTime: 10 * 60_000,
  });
}

export function buscarPibes(termino: string, signal?: AbortSignal): Promise<PibeConResumen[]> {
  return pedir(api.students.search.$get({ query: { q: termino, date: hoyLocal() } }, { init: { signal } }));
}

/** Búsqueda mientras se escribe. La consulta anterior se cancela sola. */
export function useBusqueda(termino: string) {
  const org = useOrganizacionId();
  const limpio = termino.trim();
  return useQuery({
    queryKey: claves.busqueda(org, limpio, hoyLocal()),
    queryFn: ({ signal }) => buscarPibes(limpio, signal),
    enabled: limpio.length >= MINIMO_PARA_BUSCAR,
    // Mientras llega la búsqueda nueva se siguen viendo los resultados anteriores.
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function usePibe(id: string) {
  const org = useOrganizacionId();
  return useQuery({
    queryKey: claves.pibe(org, id),
    queryFn: (): Promise<PibeConResumen> => pedir(api.students[":id"].$get({ param: { id } })),
  });
}

/** Si el pibe tiene el presente de un día. */
export function usePresente(id: string, fecha: string) {
  const org = useOrganizacionId();
  return useQuery({
    queryKey: claves.presente(org, id, fecha),
    queryFn: async () =>
      (await pedir(api.attendance.check.$get({ query: { student_id: id, date: fecha } }))).marked,
    enabled: Boolean(fecha),
  });
}

function useInvalidarAsistencia() {
  const org = useOrganizacionId();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: claves.pibes(org) }),
      queryClient.invalidateQueries({ queryKey: claves.asistencia(org) }),
    ]);
}

interface Presente {
  pibeId: string;
  fecha: string;
}

export function useMarcarPresente() {
  const invalidar = useInvalidarAsistencia();
  return useMutation({
    mutationFn: ({ pibeId, fecha }: Presente) =>
      pedir(api.attendance.mark.$post({ json: { student_id: pibeId, fecha } })),
    // Marcar dos veces no duplica, así que es seguro reintentar una vez si
    // falló la red, el servidor o venció el token.
    retry: (intentos, error) =>
      intentos < 1 &&
      (!(error instanceof ErrorDeApi) || error.status === 0 || error.status === 401 || error.status >= 500),
    retryDelay: 800,
    onSettled: invalidar,
  });
}

export function useDesmarcarPresente() {
  const invalidar = useInvalidarAsistencia();
  return useMutation({
    mutationFn: async ({ pibeId, fecha }: Presente) => {
      try {
        await pedir(api.attendance.unmark.$delete({ json: { student_id: pibeId, fecha } }));
      } catch (error) {
        // 404: ya no tenía asistencia ese día. Queda como se quería.
        if (!(error instanceof ErrorDeApi && error.status === 404)) throw error;
      }
    },
    onSettled: invalidar,
  });
}

export function useAltaDePibe() {
  const invalidar = useInvalidarAsistencia();
  return useMutation({
    mutationFn: (json: Parameters<typeof api.students.$post>[0]["json"]) =>
      pedir(api.students.$post({ json })),
    onSuccess: invalidar,
  });
}

export function useEditarPibe(id: string) {
  const invalidar = useInvalidarAsistencia();
  return useMutation({
    mutationFn: (json: { entrego_ficha: boolean; observaciones: string }) =>
      pedir(api.students[":id"].$patch({ param: { id }, json })),
    onSuccess: invalidar,
  });
}

export function useHistorial(anio: number) {
  const org = useOrganizacionId();
  const fechas = useQuery({
    queryKey: claves.fechas(org, anio),
    queryFn: () => pedir(api.attendance.dates.$get({ query: { year: String(anio) } })),
  });
  const podio = useQuery({
    queryKey: claves.podio(org, anio),
    queryFn: () => pedir(api.attendance.top.$get({ query: { year: String(anio) } })),
  });
  return { fechas, podio };
}

export function usePresentesDelDia(fecha: string) {
  const org = useOrganizacionId();
  return useQuery({
    queryKey: claves.delDia(org, fecha),
    queryFn: () => pedir(api.attendance["by-date"].$get({ query: { date: fecha } })),
  });
}
