import { hoyLocal, pibeCrearSchema } from "@garay/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Alerta, Card, EsqueletoDeLista } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";
import { useAltaDePibe, useCatalogos } from "./consultas";

type Entrada = z.input<typeof pibeCrearSchema>;
type Salida = z.output<typeof pibeCrearSchema>;

interface Props {
  /** Si se llegó buscando a alguien que no existe: lo que se buscó. */
  terminoBuscado?: string;
  alCrear: (id: string) => void;
}

/**
 * Alta de un chico desde la pantalla de ingreso: queda presente hoy. Valida
 * con el mismo esquema que usa la API (packages/shared).
 */
export function NuevoChico({ terminoBuscado, alCrear }: Props) {
  const catalogos = useCatalogos();
  const alta = useAltaDePibe();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(pibeCrearSchema),
    defaultValues: { nombre: "", apellido: terminoBuscado ?? "", entrego_ficha: "true" },
  });

  if (catalogos.isPending) return <EsqueletoDeLista filas={3} />;
  if (catalogos.isError) {
    return (
      <Alerta
        tono="error"
        accion={
          <Button variant="outline" size="sm" onClick={() => void catalogos.refetch()}>
            Reintentar
          </Button>
        }
      >
        No se pudieron cargar los grados y categorías. Intentá nuevamente.
      </Alerta>
    );
  }
  const { grados, edades } = catalogos.data;

  const guardar = handleSubmit(async (datos) => {
    try {
      const { id } = await alta.mutateAsync({ ...datos, fecha: hoyLocal() });
      toast.success(`${datos.nombre} ${datos.apellido} fue agregado y el presente quedó marcado para hoy.`);
      alCrear(id);
    } catch (error) {
      toast.error(`No se pudo guardar (${mensajeDeError(error)}). Intentá de nuevo.`);
    }
  });

  return (
    <div className="grid gap-4">
      {terminoBuscado && (
        <Alerta tono="aviso">
          No se encontró "<strong>{terminoBuscado}</strong>". Si es la primera vez que viene, completá los
          datos:
        </Alerta>
      )}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <UserPlus className="size-5 text-primary" aria-hidden />
          Nuevo chico
        </h2>
        <form onSubmit={guardar} noValidate className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" error={errors.nombre?.message}>
            {(props) => (
              <Input
                {...props}
                autoFocus
                autoComplete="given-name"
                autoCapitalize="words"
                {...register("nombre")}
              />
            )}
          </Campo>
          <Campo etiqueta="Apellido" error={errors.apellido?.message}>
            {(props) => (
              <Input {...props} autoComplete="family-name" autoCapitalize="words" {...register("apellido")} />
            )}
          </Campo>
          <Campo etiqueta="Grado" error={errors.grado_id?.message}>
            {(props) => (
              <Select {...props} {...register("grado_id")}>
                {grados.length === 0 && <option value="">No hay grados cargados</option>}
                {grados.map((grado) => (
                  <option key={grado.id} value={grado.id}>
                    {grado.label}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
          <Campo etiqueta="Categoría" error={errors.edad_id?.message}>
            {(props) => (
              <Select {...props} {...register("edad_id")}>
                {edades.length === 0 && <option value="">No hay categorías cargadas</option>}
                {edades.map((edad) => (
                  <option key={edad.id} value={edad.id}>
                    {edad.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
          <Campo etiqueta="¿Trajo la ficha?">
            {(props) => (
              <Select
                {...props}
                {...register("entrego_ficha", { setValueAs: (valor) => valor === true || valor === "true" })}
              >
                <option value="true">Sí, trajo la ficha</option>
                <option value="false">No trajo la ficha</option>
              </Select>
            )}
          </Campo>
          <Campo etiqueta="Teléfono de emergencia (opcional)">
            {(props) => (
              <Input
                {...props}
                type="tel"
                autoComplete="tel"
                placeholder="Ej: 1122334455"
                {...register("telefono_emergencia")}
              />
            )}
          </Campo>
          <Campo etiqueta="Observaciones (opcional)" className="sm:col-span-2">
            {(props) => (
              <Input
                {...props}
                placeholder="Ej: pendiente de ficha médica..."
                {...register("observaciones")}
              />
            )}
          </Campo>
          <Button type="submit" size="lg" className="sm:col-span-2" cargando={alta.isPending}>
            Agregar y marcar presente
          </Button>
        </form>
      </Card>
    </div>
  );
}
