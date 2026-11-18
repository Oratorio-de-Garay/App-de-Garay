import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Por qué el control está deshabilitado. */
  mensaje: string;
  children: ReactNode;
  className?: string;
}

/**
 * Explica por qué un control deshabilitado no se puede usar. Un control
 * deshabilitado no recibe mouse ni toques, así que el aviso va en el contenedor:
 * aparece al pasar el mouse, al enfocarlo con el teclado y al tocarlo en el
 * celular (donde no hay "hover"). Se cierra al sacar el mouse o tocar afuera.
 */
export function AvisoDeDeshabilitado({ mensaje, children, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <div
      className={cn("relative", className)}
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onFocus={() => setAbierto(true)}
      onBlur={() => setAbierto(false)}
      onClick={() => setAbierto((actual) => !actual)}
    >
      {/* Los hijos no capturan eventos: todo pasa por el contenedor. */}
      <div className="pointer-events-none">{children}</div>
      <p
        id={id}
        role="tooltip"
        hidden={!abierto}
        className="absolute inset-x-0 bottom-full z-10 mb-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground shadow-md"
      >
        {mensaje}
      </p>
    </div>
  );
}
