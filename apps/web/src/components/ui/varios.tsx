import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { iniciales, tonoDe } from "@/lib/formato";
import { cn } from "@/lib/utils";

// ── Tarjeta ───────────────────────────────────────────────

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-card", className)} {...props} />
  );
}

// ── Etiqueta de estado ────────────────────────────────────

const estilosBadge = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tono: {
        neutro: "bg-muted text-muted-foreground",
        marca: "bg-accent text-accent-foreground",
        exito: "bg-success-soft text-success",
        aviso: "bg-warning-soft text-warning",
        peligro: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
        contorno: "border bg-card text-foreground",
      },
    },
    defaultVariants: { tono: "neutro" },
  },
);

export type TonoBadge = NonNullable<VariantProps<typeof estilosBadge>["tono"]>;

export function Badge({
  className,
  tono,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof estilosBadge>) {
  return <span className={cn(estilosBadge({ tono }), className)} {...props} />;
}

// ── Mensaje en línea ──────────────────────────────────────

const tonosAlerta = {
  exito: { clase: "border-success/25 bg-success-soft text-success", Icono: CheckCircle2 },
  aviso: { clase: "border-warning/30 bg-warning-soft text-warning", Icono: AlertTriangle },
  error: { clase: "border-danger/25 bg-danger-soft text-danger", Icono: XCircle },
  info: { clase: "border-info/20 bg-info-soft text-info", Icono: Info },
};

export type TonoAlerta = keyof typeof tonosAlerta;

export function Alerta({
  tono = "info",
  className,
  children,
  accion,
}: {
  tono?: TonoAlerta;
  className?: string;
  children: ReactNode;
  accion?: ReactNode;
}) {
  const { clase, Icono } = tonosAlerta[tono];
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium",
        clase,
        className,
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
      {accion}
    </div>
  );
}

// ── Avatar con iniciales ──────────────────────────────────

export function Avatar({
  nombre,
  semilla,
  tamano = "md",
  className,
}: {
  nombre: string;
  /** De qué sale el color; por defecto, del nombre. */
  semilla?: string;
  tamano?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tamanos = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" };
  const tono = tonoDe(semilla ?? nombre);
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide",
        tamanos[tamano],
        className,
      )}
      style={{ background: `hsl(${tono} 45% 90%)`, color: `hsl(${tono} 45% 28%)` } as CSSProperties}
    >
      {iniciales(nombre)}
    </div>
  );
}

/** Avatar + nombre + una línea secundaria. Lo usan casi todas las tablas. */
export function Persona({
  nombre,
  secundario,
  semilla,
  tamano = "sm",
}: {
  nombre: string;
  secundario?: ReactNode;
  semilla?: string;
  tamano?: "sm" | "md";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar nombre={nombre} semilla={semilla} tamano={tamano} />
      <div className="min-w-0">
        <div className="truncate font-semibold">{nombre}</div>
        {secundario && <div className="truncate text-[13px] text-muted-foreground">{secundario}</div>}
      </div>
    </div>
  );
}

// ── Esqueleto de carga ────────────────────────────────────

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function EsqueletoDeLista({ filas = 4 }: { filas?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <Card key={i} className="flex items-center gap-3 p-4 shadow-none">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Estado vacío ──────────────────────────────────────────

export function EstadoVacio({
  icono,
  titulo,
  children,
  accion,
}: {
  icono?: ReactNode;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      {icono && <div className="mb-1 text-muted-foreground [&_svg]:size-9 [&_svg]:stroke-[1.5]">{icono}</div>}
      <p className="font-semibold">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

// ── Pestañas ──────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "-mx-4 flex gap-1 overflow-x-auto px-4 pb-px [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden",
        "border-b",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
        "data-[state=active]:border-primary data-[state=active]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-5 outline-none", className)} {...props} />;
}

// ── Encabezado de sección ─────────────────────────────────

export function Seccion({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

/** Número grande con su leyenda (los resúmenes de arriba de cada pantalla). */
export function Dato({ valor, leyenda }: { valor: ReactNode; leyenda: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-2.5 backdrop-blur-sm">
      <div className="text-xl leading-tight font-bold tabular-nums">{valor}</div>
      <div className="text-xs text-sidebar-foreground/80">{leyenda}</div>
    </div>
  );
}

/** Franja de presentación de una pantalla, con sus números. */
export function Portada({
  etiqueta,
  titulo,
  children,
  datos,
}: {
  etiqueta: string;
  titulo: string;
  children?: ReactNode;
  datos?: ReactNode;
}) {
  return (
    <section className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-700 px-5 py-5 text-white shadow-card">
      <div className="min-w-0 max-w-xl">
        <p className="text-xs font-semibold tracking-wider text-brand-200 uppercase">{etiqueta}</p>
        <h1 className="mt-1 text-xl leading-tight font-bold text-balance md:text-2xl">{titulo}</h1>
        {children && <p className="mt-1.5 text-sm text-pretty text-white/80">{children}</p>}
      </div>
      {datos && <div className="flex flex-wrap gap-2">{datos}</div>}
    </section>
  );
}
