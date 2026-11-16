import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface StepperProps {
  valor: number;
  alCambiar: (valor: number) => void;
  paso?: number;
  minimo?: number;
  /** Qué se está contando ("cantidad", "precio"), para los lectores de pantalla. */
  etiqueta: string;
  id?: string;
  className?: string;
}

/**
 * Número entero con botones − / +. Para cantidades (paso 1) y precios (paso
 * 50): en una feria se cobra rápido y con una mano.
 */
export function Stepper({ valor, alCambiar, paso = 1, minimo = 0, etiqueta, id, className }: StepperProps) {
  // Lo que se está tipeando puede ser momentáneamente inválido ("", "1."): se
  // guarda aparte y se normaliza al salir del campo.
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);

  const normalizar = (crudo: number) => Math.max(minimo, Math.round(Number.isFinite(crudo) ? crudo : minimo));
  const boton =
    "flex size-11 shrink-0 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 md:size-10";

  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25",
        className,
      )}
    >
      <button
        type="button"
        className={boton}
        aria-label={`Restar ${etiqueta}`}
        disabled={valor <= minimo}
        onClick={() => alCambiar(normalizar(valor - paso))}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={paso}
        min={minimo}
        aria-label={etiqueta}
        className="w-full min-w-12 border-x border-input bg-transparent px-1 text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const numero = Number(e.target.value);
          // Mientras se tipea sólo se avisa si ya es un valor válido; lo demás
          // ("" o por debajo del mínimo) se corrige al salir del campo.
          if (e.target.value !== "" && Number.isFinite(numero) && numero >= minimo)
            alCambiar(Math.round(numero));
        }}
        onBlur={() => {
          const normalizado = normalizar(Number(texto));
          setTexto(String(normalizado));
          if (normalizado !== valor) alCambiar(normalizado);
        }}
      />
      <button
        type="button"
        className={boton}
        aria-label={`Sumar ${etiqueta}`}
        onClick={() => alCambiar(normalizar(valor + paso))}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
