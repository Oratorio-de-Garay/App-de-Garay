import { comboSchema, presupuestoSchema, productoSchema } from "@garay/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Layers, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Consulta } from "@/components/consulta";
import { alEnviarFormulario, DialogoDeFormulario, useConfirmar } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Campo, Checkbox, Input, Select } from "@/components/ui/campos";
import { Badge, EstadoVacio, Seccion } from "@/components/ui/varios";
import { mensajeDeError } from "@/lib/api";
import { formatoPesos } from "@/lib/formato";
import {
  type Combo,
  type Presupuesto,
  type Producto,
  useBorrarCombo,
  useBorrarPresupuesto,
  useBorrarProducto,
  useCombos,
  useGuardarCombo,
  useGuardarPresupuesto,
  useGuardarProducto,
  useMeta,
  usePresupuestos,
  useProductos,
} from "./consultas";

// Catálogo del buffet: productos, combos y presupuestos. Las tres pestañas
// siguen el mismo molde: listado, diálogo de alta/edición y baja con
// confirmación.

/** `null` = alta; un item = edición; `undefined` = diálogo cerrado. */
type Edicion<T> = T | null | undefined;

function Acciones({ alEditar, alEliminar }: { alEditar?: () => void; alEliminar: () => void }) {
  return (
    <>
      {alEditar && (
        <Button variant="outline" size="sm" onClick={alEditar}>
          <Pencil aria-hidden />
          Editar
        </Button>
      )}
      <Button variant="destructive-ghost" size="sm" onClick={alEliminar}>
        <Trash2 aria-hidden />
        Eliminar
      </Button>
    </>
  );
}

/** Pide confirmación, borra y avisa. */
function useEliminar(borrar: (id: string) => Promise<unknown>, pregunta: string) {
  const confirmar = useConfirmar();
  return async (id: string) => {
    if (!(await confirmar({ titulo: pregunta, textoConfirmar: "Eliminar", destructivo: true }))) return;
    try {
      await borrar(id);
      toast.success("Eliminado.");
    } catch (error) {
      toast.error(mensajeDeError(error));
    }
  };
}

const estado = (activo: boolean) => (
  <Badge tono={activo ? "exito" : "neutro"}>{activo ? "Activo" : "Inactivo"}</Badge>
);
const inactivo = (item: { active: boolean }) => (item.active ? undefined : "opacity-60");

// ── Productos ─────────────────────────────────────────────

export function Productos() {
  const productos = useProductos();
  const borrar = useBorrarProducto();
  const eliminar = useEliminar(borrar.mutateAsync, "¿Eliminar este producto?");
  const [edicion, setEdicion] = useState<Edicion<Producto>>();

  return (
    <>
      <Seccion
        titulo="Productos"
        descripcion="Alta, edición y baja. Los productos donados no necesitan costo ni proveedor."
        acciones={
          <Button onClick={() => setEdicion(null)}>
            <Plus aria-hidden />
            Nuevo producto
          </Button>
        }
      />
      <Consulta consulta={productos}>
        {(items) => (
          <Listado
            clave="buffet-productos"
            titulo="Productos"
            items={items}
            idDe={(p) => p.id}
            claseDeFila={inactivo}
            vacio={
              <EstadoVacio icono={<Package />} titulo="No hay productos cargados.">
                Cargá lo que se vende en las ferias para poder registrar ventas.
              </EstadoVacio>
            }
            columnas={[
              {
                titulo: "Producto",
                celda: (p) => (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.name}
                      {p.is_donated && <Badge tono="marca">Donado</Badge>}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {p.category_name || "Sin categoría"} · {p.unit_name || "Sin unidad"}
                    </div>
                  </div>
                ),
              },
              { titulo: "Precio", numerica: true, celda: (p) => formatoPesos(p.sale_price) },
              {
                titulo: "Stock",
                numerica: true,
                celda: (p) => (
                  <span className={p.stock_current < 0 ? "text-danger" : undefined}>{p.stock_current}</span>
                ),
              },
              { titulo: "Estado", celda: (p) => estado(p.active) },
              {
                titulo: "",
                acciones: true,
                celda: (p) => (
                  <Acciones alEditar={() => setEdicion(p)} alEliminar={() => void eliminar(p.id)} />
                ),
              },
            ]}
          />
        )}
      </Consulta>
      {edicion !== undefined && (
        <FormularioDeProducto producto={edicion} alCerrar={() => setEdicion(undefined)} />
      )}
    </>
  );
}

/** Lo recién creado, listo para sumarlo a una venta (la API sólo devuelve el id). */
export interface Creado {
  id: string;
  name: string;
  sale_price: number;
  active: boolean;
}

/** Alta/edición de producto. También lo usa Nueva venta para crear uno al vuelo. */
export function FormularioDeProducto({
  producto,
  alCerrar,
  alGuardar,
}: {
  producto: Producto | null;
  alCerrar: () => void;
  alGuardar?: (creado: Creado) => void;
}) {
  const meta = useMeta();
  const guardar = useGuardarProducto();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof productoSchema>, unknown, z.output<typeof productoSchema>>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      name: producto?.name ?? "",
      category_id: producto?.category_id ?? "",
      unit_id: producto?.unit_id ?? "",
      sale_price: producto?.sale_price ?? 0,
      stock_current: producto?.stock_current ?? 0,
      is_donated: producto?.is_donated ?? false,
      active: producto?.active ?? true,
      observation: producto?.observation ?? "",
    },
  });

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={producto ? "Editar producto" : "Nuevo producto"}
      alEnviar={alEnviarFormulario(handleSubmit, async (json) => {
        const { id } = await guardar.mutateAsync({ id: producto?.id, json });
        alGuardar?.({ id, name: json.name, sale_price: json.sale_price, active: json.active });
      })}
    >
      <Campo etiqueta="Nombre" requerido error={errors.name?.message}>
        {(props) => <Input {...props} autoFocus placeholder="Ej: Empanada de carne" {...register("name")} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Categoría">
          {(props) => (
            <Select {...props} {...register("category_id")}>
              <option value="">Sin categoría</option>
              {meta.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        <Campo etiqueta="Unidad">
          {(props) => (
            <Select {...props} {...register("unit_id")}>
              <option value="">Sin unidad</option>
              {meta.data?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        <Campo etiqueta="Precio de venta" error={errors.sale_price?.message}>
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              {...register("sale_price")}
            />
          )}
        </Campo>
        <Campo etiqueta="Stock" error={errors.stock_current?.message}>
          {(props) => (
            <Input {...props} type="number" inputMode="numeric" step="1" {...register("stock_current")} />
          )}
        </Campo>
      </div>
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox {...register("is_donated")} />
        Producto donado (sin costo ni proveedor)
      </label>
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox {...register("active")} />
        Producto activo (aparece en Nueva venta)
      </label>
      <Campo etiqueta="Observación">{(props) => <Input {...props} {...register("observation")} />}</Campo>
    </DialogoDeFormulario>
  );
}

// ── Combos ────────────────────────────────────────────────

export function Combos() {
  const combos = useCombos();
  const borrar = useBorrarCombo();
  const eliminar = useEliminar(borrar.mutateAsync, "¿Eliminar este combo?");
  const [edicion, setEdicion] = useState<Edicion<Combo>>();

  return (
    <>
      <Seccion
        titulo="Combos"
        descripcion="Armá productos agrupados y definí un precio único de venta."
        acciones={
          <Button onClick={() => setEdicion(null)}>
            <Plus aria-hidden />
            Nuevo combo
          </Button>
        }
      />
      <Consulta consulta={combos}>
        {(items) => (
          <Listado
            clave="buffet-combos"
            titulo="Combos"
            items={items}
            idDe={(c) => c.id}
            claseDeFila={inactivo}
            vacio={<EstadoVacio icono={<Layers />} titulo="No hay combos cargados." />}
            columnas={[
              {
                titulo: "Combo",
                celda: (c) => (
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    {c.description && (
                      <div className="text-[13px] text-muted-foreground">{c.description}</div>
                    )}
                  </div>
                ),
              },
              { titulo: "Precio", numerica: true, celda: (c) => formatoPesos(c.sale_price) },
              { titulo: "Ítems", numerica: true, celda: (c) => c.items_count },
              { titulo: "Estado", celda: (c) => estado(c.active) },
              {
                titulo: "",
                acciones: true,
                celda: (c) => (
                  <Acciones alEditar={() => setEdicion(c)} alEliminar={() => void eliminar(c.id)} />
                ),
              },
            ]}
          />
        )}
      </Consulta>
      {edicion !== undefined && <FormularioDeCombo combo={edicion} alCerrar={() => setEdicion(undefined)} />}
    </>
  );
}

/** Alta/edición de combo. También lo usa Nueva venta para crear uno al vuelo. */
export function FormularioDeCombo({
  combo,
  alCerrar,
  alGuardar,
}: {
  combo: Combo | null;
  alCerrar: () => void;
  alGuardar?: (creado: Creado) => void;
}) {
  const guardar = useGuardarCombo();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof comboSchema>, unknown, z.output<typeof comboSchema>>({
    resolver: zodResolver(comboSchema),
    defaultValues: {
      name: combo?.name ?? "",
      description: combo?.description ?? "",
      sale_price: combo?.sale_price ?? 0,
      active: combo?.active ?? true,
    },
  });

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={combo ? "Editar combo" : "Nuevo combo"}
      ancho="sm"
      alEnviar={alEnviarFormulario(handleSubmit, async (json) => {
        const { id } = await guardar.mutateAsync({ id: combo?.id, json });
        alGuardar?.({ id, name: json.name, sale_price: json.sale_price, active: json.active });
      })}
    >
      <Campo etiqueta="Nombre" requerido error={errors.name?.message}>
        {(props) => <Input {...props} autoFocus {...register("name")} />}
      </Campo>
      <Campo etiqueta="Descripción">{(props) => <Input {...props} {...register("description")} />}</Campo>
      <Campo etiqueta="Precio de venta" error={errors.sale_price?.message}>
        {(props) => (
          <Input {...props} type="number" inputMode="numeric" step="1" min="0" {...register("sale_price")} />
        )}
      </Campo>
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox {...register("active")} />
        Combo activo (aparece en Nueva venta)
      </label>
    </DialogoDeFormulario>
  );
}

// ── Presupuestos ──────────────────────────────────────────

const ESTADOS_DE_PRESUPUESTO = ["borrador", "enviado", "aprobado", "rechazado"] as const;
const TONO_DE_PRESUPUESTO = {
  borrador: "neutro",
  enviado: "info",
  aprobado: "exito",
  rechazado: "peligro",
} as const;

export function Presupuestos() {
  const presupuestos = usePresupuestos();
  const borrar = useBorrarPresupuesto();
  const eliminar = useEliminar(borrar.mutateAsync, "¿Eliminar este presupuesto?");
  const [edicion, setEdicion] = useState<Edicion<Presupuesto>>();

  return (
    <>
      <Seccion
        titulo="Presupuestos"
        descripcion="Presupuestos por producto o combo, calculados por cantidad."
        acciones={
          <Button onClick={() => setEdicion(null)}>
            <Plus aria-hidden />
            Nuevo presupuesto
          </Button>
        }
      />
      <Consulta consulta={presupuestos}>
        {(items) => (
          <Listado
            clave="buffet-presupuestos"
            titulo="Presupuestos"
            items={items}
            idDe={(p) => p.id}
            vacio={<EstadoVacio icono={<FileText />} titulo="No hay presupuestos cargados." />}
            columnas={[
              {
                titulo: "Presupuesto",
                celda: (p) => (
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    {p.client_name && (
                      <div className="text-[13px] text-muted-foreground">{p.client_name}</div>
                    )}
                  </div>
                ),
              },
              { titulo: "Total", numerica: true, celda: (p) => formatoPesos(p.total_amount) },
              { titulo: "Ítems", numerica: true, celda: (p) => p.items_count },
              {
                titulo: "Estado",
                celda: (p) => (
                  <Badge tono={TONO_DE_PRESUPUESTO[p.status as keyof typeof TONO_DE_PRESUPUESTO] ?? "neutro"}>
                    {p.status || "borrador"}
                  </Badge>
                ),
              },
              {
                titulo: "",
                acciones: true,
                celda: (p) => (
                  <Acciones alEditar={() => setEdicion(p)} alEliminar={() => void eliminar(p.id)} />
                ),
              },
            ]}
          />
        )}
      </Consulta>
      {edicion !== undefined && (
        <FormularioDePresupuesto presupuesto={edicion} alCerrar={() => setEdicion(undefined)} />
      )}
    </>
  );
}

function FormularioDePresupuesto({
  presupuesto,
  alCerrar,
}: {
  presupuesto: Presupuesto | null;
  alCerrar: () => void;
}) {
  const guardar = useGuardarPresupuesto();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof presupuestoSchema>, unknown, z.output<typeof presupuestoSchema>>({
    resolver: zodResolver(presupuestoSchema),
    defaultValues: {
      title: presupuesto?.title ?? "",
      client_name: presupuesto?.client_name ?? "",
      status: presupuesto?.status ?? "borrador",
      total_amount: presupuesto?.total_amount ?? 0,
      observation: presupuesto?.observation ?? "",
    },
  });

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={presupuesto ? "Editar presupuesto" : "Nuevo presupuesto"}
      alEnviar={alEnviarFormulario(handleSubmit, (json) =>
        guardar.mutateAsync({ id: presupuesto?.id, json }),
      )}
    >
      <Campo etiqueta="Título" requerido error={errors.title?.message}>
        {(props) => <Input {...props} autoFocus {...register("title")} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cliente">{(props) => <Input {...props} {...register("client_name")} />}</Campo>
        <Campo etiqueta="Estado">
          {(props) => (
            <Select {...props} {...register("status")}>
              {ESTADOS_DE_PRESUPUESTO.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </Select>
          )}
        </Campo>
      </div>
      <Campo etiqueta="Total" error={errors.total_amount?.message}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            {...register("total_amount")}
          />
        )}
      </Campo>
      <Campo etiqueta="Observación">{(props) => <Input {...props} {...register("observation")} />}</Campo>
    </DialogoDeFormulario>
  );
}
