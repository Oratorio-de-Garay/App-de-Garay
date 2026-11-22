import { hoyLocal, type PibeConResumen } from "@garay/shared";
import { getRouteApi } from "@tanstack/react-router";
import { Check, History, Search, Undo2, UserPlus, Users } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirmar } from "@/components/dialogos";
import { type Columna, Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/campos";
import { Alerta, Card } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";
import { empiezaConLoBuscado } from "@/lib/formato";
import {
  buscarPibes,
  LIMITE_DE_BUSQUEDA,
  MINIMO_PARA_BUSCAR,
  useBusqueda,
  useDesmarcarPresente,
  useMarcarPresente,
} from "./consultas";
import { Ficha } from "./ficha";
import { columnasDePibe, Historial, PresentesDelDia } from "./historial";
import { NuevoChico } from "./nuevo";

const ruta = getRouteApi("/");
const ESPERA_AL_ESCRIBIR_MS = 250;

/** Devuelve el valor recién cuando dejó de cambiar por `espera` ms. */
function useValorDemorado<T>(valor: T, espera: number): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setDemorado(valor), espera);
    return () => clearTimeout(id);
  }, [valor, espera]);
  return demorado;
}

/**
 * Pantalla de ingreso. Lo que se ve sale de la URL (ficha, historial, alta),
 * así el botón "atrás" del celular hace lo esperado.
 */
export function PaginaDeAsistencia() {
  const busqueda = ruta.useSearch();
  const navigate = ruta.useNavigate();
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  /** Lo que se buscó sin encontrar a nadie: se ofrece darlo de alta. */
  const [noEncontrado, setNoEncontrado] = useState<string>();

  const irA = (search: typeof busqueda) => navigate({ search });
  const abrirFicha = (id: string) => irA({ pibe: id });
  const enInicio = !busqueda.pibe && !busqueda.vista;

  /** Enter o botón Buscar: si hay uno solo se abre su ficha; si no hay, el alta. */
  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    const termino = texto.trim();
    if (!termino) return;
    setBuscando(true);
    try {
      const encontrados = await buscarPibes(termino);
      if (encontrados.length === 0) {
        setNoEncontrado(termino);
        void irA({ vista: "nuevo" });
      } else if (encontrados.length === 1 && encontrados[0]) {
        void abrirFicha(encontrados[0].id);
      } else {
        void irA({});
      }
    } catch {
      toast.error("No se pudo conectar. Verificá tu conexión a internet.");
    } finally {
      setBuscando(false);
    }
  }

  function alEscribir(valor: string) {
    setTexto(valor);
    // Escribir vuelve a los resultados, desde donde se esté.
    if (!enInicio) void irA({});
  }

  return (
    <div className="grid gap-5">
      <Card className="p-3 sm:p-4">
        <form onSubmit={buscar} className="grid gap-2 sm:grid-cols-[1fr_auto]" role="search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="h-12 pl-11 text-base md:h-12 md:text-base"
              placeholder="Nombre o apellido del pibe..."
              aria-label="Buscar por nombre o apellido"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="search"
              value={texto}
              onChange={(e) => alEscribir(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button type="submit" size="lg" cargando={buscando}>
              Buscar
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setTexto("");
                setNoEncontrado(undefined);
                void irA({ vista: "nuevo" });
              }}
            >
              <UserPlus aria-hidden />
              <span>Nuevo chico</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setTexto("");
                void irA({ vista: "historial" });
              }}
            >
              <History aria-hidden />
              Historial
            </Button>
          </div>
        </form>
      </Card>

      {busqueda.pibe ? (
        <Ficha key={busqueda.pibe} id={busqueda.pibe} alVolver={() => history.back()} />
      ) : busqueda.vista === "nuevo" ? (
        <NuevoChico
          key={noEncontrado ?? ""}
          terminoBuscado={noEncontrado}
          alCrear={(id) => navigate({ search: { pibe: id }, replace: true })}
        />
      ) : busqueda.vista === "historial" && busqueda.fecha ? (
        <PresentesDelDia
          fecha={busqueda.fecha}
          alVolver={(anio) => irA({ vista: "historial", anio })}
          alElegirPibe={abrirFicha}
        />
      ) : busqueda.vista === "historial" ? (
        <Historial
          anio={busqueda.anio ?? new Date().getFullYear()}
          alCambiarAnio={(anio) => navigate({ search: { vista: "historial", anio }, replace: true })}
          alElegirFecha={(fecha) => irA({ vista: "historial", fecha })}
          alElegirPibe={abrirFicha}
        />
      ) : (
        <Resultados texto={texto} alElegir={abrirFicha} />
      )}
    </div>
  );
}

/** Sugerencias mientras se escribe, con el presente de hoy a un toque. */
function Resultados({ texto, alElegir }: { texto: string; alElegir: (id: string) => void }) {
  const termino = useValorDemorado(texto.trim(), ESPERA_AL_ESCRIBIR_MS);
  const busqueda = useBusqueda(termino);

  if (texto.trim().length < MINIMO_PARA_BUSCAR) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Users className="size-10 stroke-[1.5]" aria-hidden />
        <p className="max-w-xs text-sm text-pretty">
          Escribí el nombre o el apellido para buscar a un chico y marcarle el presente.
        </p>
      </div>
    );
  }
  if (busqueda.isError)
    return <Alerta tono="error">No se pudo conectar. Verificá tu conexión a internet.</Alerta>;
  // Mientras se escribe, sin coincidencias no se muestra nada: recién al tocar
  // "Buscar" se ofrece darlo de alta.
  if (!busqueda.data?.length) return null;

  const pibes = busqueda.data;
  const columnas: Columna<PibeConResumen>[] = [
    ...columnasDePibe,
    { titulo: "Presente", acciones: true, celda: (pibe) => <PresenteRapido pibe={pibe} /> },
  ];

  // La base ya los trae ordenados: primero los que empiezan con lo buscado.
  // La línea va en el primero que sólo lo contiene, y sólo si arriba hay otros.
  const primeroQueContiene = pibes.find(
    (pibe, i) =>
      i > 0 &&
      !empiezaConLoBuscado(termino, pibe.nombreCompleto) &&
      empiezaConLoBuscado(termino, pibes[i - 1]?.nombreCompleto ?? ""),
  )?.id;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pibes.length === 1 ? "Se encontró 1 chico." : `Se encontraron ${pibes.length} chicos.`}
        {pibes.length >= LIMITE_DE_BUSQUEDA && " Hay más: refiná la búsqueda."} Tocá uno para ver su ficha.
      </p>
      <Listado
        clave="registro-busqueda"
        titulo="Resultados de la búsqueda"
        items={pibes}
        idDe={(pibe) => pibe.id}
        alTocarFila={(pibe) => alElegir(pibe.id)}
        columnas={columnas}
        // Separación entre "empieza con" y "contiene", sin etiquetas. Tabla: la
        // tabla se corta con un hueco. Celular: línea en el hueco entre tarjetas.
        cortarAntesDe={(pibe) => pibe.id === primeroQueContiene}
        claseDeFila={(pibe) =>
          pibe.id === primeroQueContiene
            ? "relative mt-4 before:absolute before:inset-x-2 before:-top-3 before:h-px before:bg-muted-foreground/25 md:mt-0 md:before:hidden"
            : undefined
        }
      />
    </div>
  );
}

/** Marca o desmarca el presente de HOY sin abrir la ficha. */
function PresenteRapido({ pibe }: { pibe: PibeConResumen }) {
  const confirmar = useConfirmar();
  const marcar = useMarcarPresente();
  const desmarcar = useDesmarcarPresente();
  const marcado = pibe.marcado_hoy === true;
  const cual = { pibeId: pibe.id, fecha: hoyLocal() };

  async function alternar() {
    try {
      if (marcado) {
        const ok = await confirmar({
          titulo: `¿Desmarcar el presente de ${pibe.nombreCompleto}?`,
          textoConfirmar: "Desmarcar",
          destructivo: true,
        });
        if (!ok) return;
        await desmarcar.mutateAsync(cual);
        toast.info(`Presente desmarcado para ${pibe.nombreCompleto}.`);
      } else {
        const { alreadyMarked } = await marcar.mutateAsync(cual);
        if (alreadyMarked) toast.info(`${pibe.nombreCompleto} ya tenía el presente marcado para hoy.`);
        else toast.success(`Presente marcado para ${pibe.nombreCompleto}.`);
      }
    } catch (error) {
      toast.error(`No se pudo ${marcado ? "desmarcar" : "marcar"} el presente (${mensajeDeError(error)}).`);
    }
  }

  return (
    <Button
      size="sm"
      variant={marcado ? "outline" : "default"}
      className={marcado ? "border-success/40 bg-success-soft text-success hover:bg-success-soft/70" : ""}
      cargando={marcar.isPending || desmarcar.isPending}
      onClick={alternar}
    >
      {marcado ? <Undo2 aria-hidden /> : <Check aria-hidden />}
      {marcado ? "Desmarcar presente" : "Marcar presente"}
    </Button>
  );
}
