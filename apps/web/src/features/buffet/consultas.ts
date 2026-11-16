import type { ComboInput, PresupuestoInput, ProductoInput, VentaItemInput } from "@garay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganizacionId } from "@/features/auth/sesion";
import { api, pedir } from "@/lib/api";

// Consultas y cambios del buffet. Cada cambio invalida sólo lo que toca: una
// venta mueve stock, totales de eventos y la lista de ventas, pero no los
// combos ni los presupuestos. (Antes se volvían a pedir los 6 endpoints.)

const listarProductos = () => pedir(api.buffet.products.$get());
const listarCombos = () => pedir(api.buffet.combos.$get());
const listarPresupuestos = () => pedir(api.buffet.budgets.$get());
const listarEventos = () => pedir(api.buffet.events.$get({ query: {} }));
const listarVentas = (eventoId: string) => pedir(api.buffet.sales.$get({ query: { event_id: eventoId } }));

export type Producto = Awaited<ReturnType<typeof listarProductos>>[number];
export type Combo = Awaited<ReturnType<typeof listarCombos>>[number];
export type Presupuesto = Awaited<ReturnType<typeof listarPresupuestos>>[number];
export type Evento = Awaited<ReturnType<typeof listarEventos>>[number];
export type Venta = Awaited<ReturnType<typeof listarVentas>>["sales"][number];

type Recurso = "meta" | "productos" | "combos" | "presupuestos" | "eventos" | "ventas";
const clave = (org: string, recurso: Recurso, ...resto: string[]) => [
  "org",
  org,
  "buffet",
  recurso,
  ...resto,
];

export function useMeta() {
  const org = useOrganizacionId();
  return useQuery({
    queryKey: clave(org, "meta"),
    queryFn: () => pedir(api.buffet.meta.$get()),
    staleTime: 10 * 60_000,
  });
}

export function useProductos() {
  const org = useOrganizacionId();
  return useQuery({ queryKey: clave(org, "productos"), queryFn: listarProductos });
}

export function useCombos() {
  const org = useOrganizacionId();
  return useQuery({ queryKey: clave(org, "combos"), queryFn: listarCombos });
}

export function usePresupuestos() {
  const org = useOrganizacionId();
  return useQuery({ queryKey: clave(org, "presupuestos"), queryFn: listarPresupuestos });
}

export function useEventos() {
  const org = useOrganizacionId();
  return useQuery({ queryKey: clave(org, "eventos"), queryFn: listarEventos });
}

export function useVentas(eventoId: string) {
  const org = useOrganizacionId();
  return useQuery({ queryKey: clave(org, "ventas", eventoId), queryFn: () => listarVentas(eventoId) });
}

/** Mutación que, al terminar bien, invalida los recursos indicados. */
function useCambio<Variables, Resultado>(
  cambiar: (variables: Variables) => Promise<Resultado>,
  afecta: Recurso[],
) {
  const org = useOrganizacionId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cambiar,
    onSuccess: () =>
      Promise.all(afecta.map((recurso) => queryClient.invalidateQueries({ queryKey: clave(org, recurso) }))),
  });
}

// ── Catálogo ──────────────────────────────────────────────

export const useGuardarProducto = () =>
  useCambio(
    ({ id, json }: { id?: string; json: ProductoInput }) =>
      id
        ? pedir(api.buffet.products[":id"].$patch({ param: { id }, json }))
        : pedir(api.buffet.products.$post({ json })),
    ["productos"],
  );

export const useBorrarProducto = () =>
  useCambio((id: string) => pedir(api.buffet.products[":id"].$delete({ param: { id } })), ["productos"]);

export const useGuardarCombo = () =>
  useCambio(
    ({ id, json }: { id?: string; json: ComboInput }) =>
      id
        ? pedir(api.buffet.combos[":id"].$patch({ param: { id }, json }))
        : pedir(api.buffet.combos.$post({ json })),
    ["combos"],
  );

export const useBorrarCombo = () =>
  useCambio((id: string) => pedir(api.buffet.combos[":id"].$delete({ param: { id } })), ["combos"]);

export const useGuardarPresupuesto = () =>
  useCambio(
    ({ id, json }: { id?: string; json: PresupuestoInput }) =>
      id
        ? pedir(api.buffet.budgets[":id"].$patch({ param: { id }, json }))
        : pedir(api.buffet.budgets.$post({ json })),
    ["presupuestos"],
  );

export const useBorrarPresupuesto = () =>
  useCambio((id: string) => pedir(api.buffet.budgets[":id"].$delete({ param: { id } })), ["presupuestos"]);

// ── Eventos y ventas ──────────────────────────────────────

interface DatosDeEvento {
  nombre: string;
  fecha?: string;
  estado?: string;
  observacion?: string | null;
}

export const useGuardarEvento = () =>
  useCambio(
    ({ id, json }: { id?: string; json: DatosDeEvento }) =>
      id
        ? pedir(api.buffet.events[":id"].$patch({ param: { id }, json }))
        : pedir(api.buffet.events.$post({ json })),
    ["eventos"],
  );

export const useBorrarEvento = () =>
  useCambio((id: string) => pedir(api.buffet.events[":id"].$delete({ param: { id } })), ["eventos"]);

interface VentaAGuardar {
  /** Si viene, se edita esa venta; si no, se crea en `eventoId`. */
  id?: string;
  eventoId: string;
  payment_method: string;
  observation: string | null;
  items: VentaItemInput[];
}

const AFECTA_UNA_VENTA: Recurso[] = ["productos", "eventos", "ventas"];

export const useGuardarVenta = () =>
  useCambio(
    ({ id, eventoId, ...json }: VentaAGuardar) =>
      id
        ? pedir(api.buffet.sales[":id"].$patch({ param: { id }, json }))
        : pedir(api.buffet.sales.$post({ json: { ...json, event_id: eventoId, sale_date: null } })),
    AFECTA_UNA_VENTA,
  );

export const useBorrarVenta = () =>
  useCambio((id: string) => pedir(api.buffet.sales[":id"].$delete({ param: { id } })), AFECTA_UNA_VENTA);
