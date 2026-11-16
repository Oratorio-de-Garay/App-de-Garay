import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FieldValues, UseFormHandleSubmit } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alerta } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";

// ─────────────────────────────────────────────────────────
// Diálogo con formulario
//
// El patrón de todos los altas y ediciones: `alEnviar` devuelve una promesa;
// si resuelve el diálogo se cierra, si falla el error se muestra adentro y el
// diálogo queda abierto con lo que la persona había escrito.
// ─────────────────────────────────────────────────────────

/** El formulario no pasó la validación: los errores ya se ven en cada campo. */
export class FormularioInvalido extends Error {}

/**
 * Une react-hook-form con DialogoDeFormulario: valida, guarda y avisa al
 * diálogo si tiene que cerrarse (guardó) o quedarse abierto (inválido o falló).
 */
export function alEnviarFormulario<Entrada extends FieldValues, Datos>(
  handleSubmit: UseFormHandleSubmit<Entrada, Datos>,
  guardar: (datos: Datos) => Promise<unknown>,
) {
  return () =>
    new Promise<void>((resolve, reject) => {
      void handleSubmit(
        async (datos) => {
          try {
            await guardar(datos);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        () => reject(new FormularioInvalido()),
      )();
    });
}

interface DialogoDeFormularioProps {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  alEnviar: () => Promise<unknown> | unknown;
  textoEnviar?: string;
  /** null lo oculta (diálogos de sólo lectura). */
  textoCancelar?: string | null;
  destructivo?: boolean;
  /** Otro botón con el mismo comportamiento (ej: Rechazar al lado de Aceptar). */
  accionSecundaria?: { texto: string; destructivo?: boolean; alTocar: () => Promise<unknown> | unknown };
  ancho?: "sm" | "md" | "lg";
}

export function DialogoDeFormulario({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  children,
  alEnviar,
  textoEnviar = "Guardar",
  textoCancelar = "Cancelar",
  destructivo,
  accionSecundaria,
  ancho,
}: DialogoDeFormularioProps) {
  const [enCurso, setEnCurso] = useState<"principal" | "secundaria" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function correr(cual: "principal" | "secundaria", accion: () => Promise<unknown> | unknown) {
    setEnCurso(cual);
    setError(null);
    try {
      await accion();
      alCerrar();
    } catch (e) {
      if (!(e instanceof FormularioInvalido)) setError(mensajeDeError(e));
    } finally {
      setEnCurso(null);
    }
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    void correr("principal", alEnviar);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (abrir || enCurso) return;
        setError(null);
        alCerrar();
      }}
    >
      <DialogContent ancho={ancho} aria-describedby={descripcion ? undefined : undefined}>
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion ? (
              <DialogDescription>{descripcion}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{titulo}</DialogDescription>
            )}
          </DialogHeader>
          <DialogBody>
            {children}
            {error && <Alerta tono="error">{error}</Alerta>}
          </DialogBody>
          <DialogFooter>
            {textoCancelar !== null && (
              <Button variant="ghost" onClick={alCerrar} disabled={enCurso !== null}>
                {textoCancelar}
              </Button>
            )}
            {accionSecundaria && (
              <Button
                variant={accionSecundaria.destructivo ? "destructive-ghost" : "outline"}
                cargando={enCurso === "secundaria"}
                disabled={enCurso !== null}
                onClick={() => void correr("secundaria", accionSecundaria.alTocar)}
              >
                {accionSecundaria.texto}
              </Button>
            )}
            <Button
              type="submit"
              variant={destructivo ? "destructive" : "default"}
              cargando={enCurso === "principal"}
              disabled={enCurso !== null}
            >
              {textoEnviar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────
// Confirmación
//
// Reemplaza al confirm() del navegador:
//   const confirmar = useConfirmar();
//   if (!(await confirmar({ titulo: "¿Eliminar este producto?" }))) return;
// ─────────────────────────────────────────────────────────

interface Pregunta {
  titulo: string;
  descripcion?: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  destructivo?: boolean;
}

type Confirmar = (pregunta: Pregunta) => Promise<boolean>;

const ContextoConfirmar = createContext<Confirmar | null>(null);

export function ProveedorDeConfirmacion({ children }: { children: ReactNode }) {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const resolver = useRef<((respuesta: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((nueva) => {
    // Una pregunta pendiente que se pisa cuenta como "no".
    resolver.current?.(false);
    setPregunta(nueva);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const responder = useCallback((respuesta: boolean) => {
    resolver.current?.(respuesta);
    resolver.current = null;
    setPregunta(null);
  }, []);

  const valor = useMemo(() => confirmar, [confirmar]);

  return (
    <ContextoConfirmar.Provider value={valor}>
      {children}
      <Dialog open={pregunta !== null} onOpenChange={(abrir) => !abrir && responder(false)}>
        {pregunta && (
          <DialogContent ancho="sm" role="alertdialog">
            <DialogHeader>
              <DialogTitle>{pregunta.titulo}</DialogTitle>
              {pregunta.descripcion ? (
                <DialogDescription>{pregunta.descripcion}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Confirmá la acción</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter className="border-t-0 pt-2">
              <Button variant="ghost" onClick={() => responder(false)}>
                {pregunta.textoCancelar ?? "Cancelar"}
              </Button>
              <Button
                autoFocus
                variant={pregunta.destructivo ? "destructive" : "default"}
                onClick={() => responder(true)}
              >
                {pregunta.textoConfirmar ?? "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ContextoConfirmar.Provider>
  );
}

export function useConfirmar(): Confirmar {
  const confirmar = useContext(ContextoConfirmar);
  if (!confirmar) throw new Error("useConfirmar necesita un <ProveedorDeConfirmacion>");
  return confirmar;
}
