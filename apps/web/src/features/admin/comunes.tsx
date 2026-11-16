import { Checkbox } from "@/components/ui/campos";
import { Badge } from "@/components/ui/varios";
import { cn } from "@/lib/utils";
import type { OrganizacionRef } from "./consultas";

export function InsigniaDeRol({ rol, nombre }: { rol: string; nombre?: string | null }) {
  if (rol === "superadmin") return <Badge tono="aviso">Superadmin</Badge>;
  if (rol === "admin") return <Badge tono="marca">Admin</Badge>;
  return <Badge>{nombre || rol}</Badge>;
}

export function ChipDeOrganizacion({ nombre }: { nombre: string | null | undefined }) {
  return <Badge tono="contorno">{nombre}</Badge>;
}

export function ListaDeChips({ organizaciones }: { organizaciones: OrganizacionRef[] }) {
  if (!organizaciones.length)
    return <span className="text-[13px] text-muted-foreground">Sin organizaciones</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1 md:justify-start">
      {organizaciones.map((org) => (
        <ChipDeOrganizacion key={org.id} nombre={org.nombre} />
      ))}
    </div>
  );
}

/** Casillas para elegir organizaciones (altas, ediciones y roles). */
export function SelectorDeOrganizaciones({
  organizaciones,
  seleccionadas,
  alCambiar,
}: {
  organizaciones: OrganizacionRef[];
  seleccionadas: string[];
  alCambiar: (ids: string[]) => void;
}) {
  if (!organizaciones.length) {
    return <p className="text-[13px] text-muted-foreground">No hay organizaciones disponibles.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {organizaciones.map((org) => {
        const marcada = seleccionadas.includes(org.id);
        return (
          <label
            key={org.id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              marcada ? "border-primary bg-brand-50 text-brand-800" : "hover:bg-muted",
            )}
          >
            <Checkbox
              checked={marcada}
              onChange={(e) =>
                alCambiar(
                  e.target.checked ? [...seleccionadas, org.id] : seleccionadas.filter((id) => id !== org.id),
                )
              }
            />
            {org.nombre}
          </label>
        );
      })}
    </div>
  );
}

/** Opción con título y explicación (radio). */
export function OpcionConDetalle({
  marcada,
  alElegir,
  titulo,
  detalle,
  nombre,
  deshabilitada,
}: {
  marcada: boolean;
  alElegir: () => void;
  titulo: string;
  detalle: string;
  nombre: string;
  deshabilitada?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        marcada ? "border-primary bg-brand-50" : "hover:bg-muted",
        deshabilitada && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={nombre}
        className="mt-1 size-4 accent-primary"
        checked={marcada}
        disabled={deshabilitada}
        onChange={alElegir}
      />
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-[13px] text-muted-foreground">{detalle}</span>
      </span>
    </label>
  );
}
