import { ChevronDown } from "lucide-react";
import { Label as LabelPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-input bg-card px-3 text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(base, "h-11 md:h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(base, "min-h-24 py-2.5", className)} {...props} />;
}

/** <select> nativo: en el celular abre el selector del sistema, que es lo más cómodo. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(base, "h-11 appearance-none pr-9 md:h-10")} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-5 shrink-0 cursor-pointer rounded border-input accent-primary md:size-4",
        className,
      )}
      {...props}
    />
  );
}

interface CampoProps {
  etiqueta: ReactNode;
  /** Mensaje de validación: si viene, el campo se marca como inválido. */
  error?: string;
  ayuda?: ReactNode;
  requerido?: boolean;
  className?: string;
  /** Recibe el id y los atributos de accesibilidad para ponerle al control. */
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Etiqueta + control + ayuda + error, enlazados para lectores de pantalla. */
export function Campo({ etiqueta, error, ayuda, requerido, className, children }: CampoProps) {
  const id = useId();
  const descripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {etiqueta}
        {requerido && <span className="ml-0.5 text-destructive"> *</span>}
      </Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": descripcion })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="text-[13px] text-muted-foreground">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}
