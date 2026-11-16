import { getRouteApi } from "@tanstack/react-router";
import { Dato, Portada, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/varios";
import { formatoPesos } from "@/lib/formato";
import { Combos, Presupuestos, Productos } from "./catalogo";
import { useCombos, useEventos, usePresupuestos, useProductos } from "./consultas";
import { Ventas } from "./ventas";

const ruta = getRouteApi("/buffet");

const PESTANAS = [
  { id: "productos", titulo: "Productos" },
  { id: "ventas", titulo: "Ventas" },
  { id: "combos", titulo: "Combos" },
  { id: "presupuestos", titulo: "Presupuestos" },
] as const;

type Pestana = (typeof PESTANAS)[number]["id"];

/** La pestaña y el evento abierto viven en la URL: se puede volver atrás y compartir el link. */
export function PaginaDeBuffet() {
  const { tab = "productos", evento } = ruta.useSearch();
  const navigate = ruta.useNavigate();

  const productos = useProductos();
  const eventos = useEventos();
  const combos = useCombos();
  const presupuestos = usePresupuestos();
  const recaudado = (eventos.data ?? []).reduce((acc, e) => acc + Number(e.total_amount || 0), 0);
  const cuenta = (lista: unknown[] | undefined) => lista?.length ?? "–";

  return (
    <>
      <Portada
        etiqueta="Gestión de buffet"
        titulo="Catálogo, ventas, combos y presupuestos"
        datos={
          <>
            <Dato valor={cuenta(productos.data)} leyenda="Productos" />
            <Dato valor={cuenta(eventos.data)} leyenda="Eventos" />
            <Dato valor={eventos.data ? formatoPesos(recaudado) : "–"} leyenda="Recaudado" />
            <Dato valor={cuenta(combos.data)} leyenda="Combos" />
            <Dato valor={cuenta(presupuestos.data)} leyenda="Presupuestos" />
          </>
        }
      >
        Administrá productos, registrá las ventas de cada evento y armá combos y presupuestos.
      </Portada>

      <Tabs value={tab} onValueChange={(nueva) => void navigate({ search: { tab: nueva as Pestana } })}>
        <TabsList aria-label="Secciones del buffet">
          {PESTANAS.map((pestana) => (
            <TabsTrigger key={pestana.id} value={pestana.id}>
              {pestana.titulo}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="productos">
          <Productos />
        </TabsContent>
        <TabsContent value="ventas">
          <Ventas
            eventoId={evento}
            alAbrir={(id) => void navigate({ search: { tab: "ventas", evento: id } })}
          />
        </TabsContent>
        <TabsContent value="combos">
          <Combos />
        </TabsContent>
        <TabsContent value="presupuestos">
          <Presupuestos />
        </TabsContent>
      </Tabs>
    </>
  );
}
