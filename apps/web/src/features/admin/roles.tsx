import { Building2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogoDeFormulario } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Alerta, Badge, Card, EstadoVacio, Persona, Seccion } from "@/components/ui/varios";
import { ChipDeOrganizacion, InsigniaDeRol, SelectorDeOrganizaciones } from "./comunes";
import {
  type Organizacion,
  type Rol,
  type Usuario,
  useAsignarRol,
  useGuardarOrganizacion,
  useQuitarRol,
} from "./consultas";
import { EMAIL } from "./textos";

// Pestañas que sólo ve el superadmin: roles y organizaciones.

type AccionDeRol =
  | { tipo: "asignar" }
  | { tipo: "editar"; usuario: Usuario; rol: string }
  | { tipo: "quitar"; usuario: Usuario; rol: string };

interface PropsDeRoles {
  usuarios: Usuario[];
  organizaciones: Organizacion[];
  roles: Rol[];
}

export function Roles({ usuarios, organizaciones, roles }: PropsDeRoles) {
  const [accion, setAccion] = useState<AccionDeRol>();
  const conRoles = usuarios.filter((u) => u.roles.length > 0);
  const hayAsignables = roles.some((r) => r.asignable_desde_panel);

  return (
    <>
      <Seccion
        titulo="Roles asignados"
        descripcion="Los roles por organización requieren elegir al menos una organización."
        acciones={
          <Button
            onClick={() =>
              hayAsignables
                ? setAccion({ tipo: "asignar" })
                : toast.error("No hay roles asignables desde el panel.")
            }
          >
            <Plus aria-hidden />
            Asignar rol
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {roles.map((rol) => (
          <Card key={rol.codigo} className="p-4 shadow-none">
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaDeRol rol={rol.codigo} nombre={rol.nombre} />
              <Badge tono="contorno">{rol.alcance === "global" ? "Global" : "Por organización"}</Badge>
            </div>
            {rol.descripcion && <p className="mt-2 text-sm text-muted-foreground">{rol.descripcion}</p>}
            {!rol.asignable_desde_panel && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                Se asigna sólo por SQL (ver docs/ROLES_Y_PERMISOS.md).
              </p>
            )}
          </Card>
        ))}
      </div>
      <Listado
        clave="admin-roles"
        titulo="Usuarios con roles"
        items={conRoles}
        idDe={(u) => u.id}
        vacio={
          <EstadoVacio icono={<ShieldCheck />} titulo="Todavía no hay roles asignados">
            Asigná el rol de administrador para que alguien pueda dar de alta usuarios en su organización.
          </EstadoVacio>
        }
        columnas={[
          {
            titulo: "Usuario",
            celda: (u) => (
              <Persona
                nombre={u.nombre || u.email}
                secundario={u.nombre ? u.email : undefined}
                semilla={u.email}
              />
            ),
          },
          {
            titulo: "Roles",
            celda: (usuario) => (
              <div className="grid gap-2">
                {agruparRoles(usuario).map((grupo) => (
                  <div
                    key={grupo.rol}
                    className="flex flex-wrap items-center justify-end gap-1.5 md:justify-start"
                  >
                    <InsigniaDeRol rol={grupo.rol} nombre={grupo.nombre} />
                    {grupo.organizaciones.map((nombre) => (
                      <ChipDeOrganizacion key={nombre} nombre={nombre} />
                    ))}
                    {roles.find((r) => r.codigo === grupo.rol)?.asignable_desde_panel && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAccion({ tipo: "editar", usuario, rol: grupo.rol })}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive-ghost"
                          size="sm"
                          onClick={() => setAccion({ tipo: "quitar", usuario, rol: grupo.rol })}
                        >
                          Quitar
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />
      {accion?.tipo === "quitar" ? (
        <ConfirmarQuitarRol
          usuario={accion.usuario}
          rol={roles.find((r) => r.codigo === accion.rol)}
          codigo={accion.rol}
          alCerrar={() => setAccion(undefined)}
        />
      ) : (
        accion && (
          <FormularioDeRol
            edicion={accion.tipo === "editar" ? accion : undefined}
            usuarios={usuarios}
            organizaciones={organizaciones}
            roles={roles.filter((r) => r.asignable_desde_panel)}
            alCerrar={() => setAccion(undefined)}
          />
        )
      )}
    </>
  );
}

/** Un usuario puede tener el mismo rol en varias organizaciones: se muestra agrupado. */
export function agruparRoles(usuario: Pick<Usuario, "roles">) {
  const grupos = new Map<string, { rol: string; nombre: string; organizaciones: string[] }>();
  for (const r of usuario.roles) {
    const grupo = grupos.get(r.rol) ?? { rol: r.rol, nombre: r.nombre, organizaciones: [] };
    if (r.organizacion_nombre) grupo.organizaciones.push(r.organizacion_nombre);
    grupos.set(r.rol, grupo);
  }
  return [...grupos.values()];
}

/** Asignar un rol nuevo, o editar las organizaciones de uno existente. */
function FormularioDeRol({
  edicion,
  usuarios,
  organizaciones,
  roles,
  alCerrar,
}: {
  edicion?: { usuario: Usuario; rol: string };
  usuarios: Usuario[];
  organizaciones: Organizacion[];
  roles: Rol[];
  alCerrar: () => void;
}) {
  const asignar = useAsignarRol();
  const [email, setEmail] = useState(edicion?.usuario.email ?? "");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState(edicion?.rol ?? roles[0]?.codigo ?? "");
  const [elegidas, setElegidas] = useState<string[]>(() =>
    edicion
      ? edicion.usuario.roles.flatMap((r) =>
          r.rol === edicion.rol && r.organizacion_id ? [r.organizacion_id] : [],
        )
      : [],
  );

  const rol = roles.find((r) => r.codigo === codigo);
  const porOrganizacion = rol?.alcance === "organizacion";
  const existente = usuarios.find((u) => u.email === email.trim().toLowerCase());

  /** Al elegir a alguien que ya tiene el rol, se marcan sus organizaciones actuales. */
  function precargar(deEmail: string, deRol: string) {
    if (edicion) return;
    const usuario = usuarios.find((u) => u.email === deEmail.trim().toLowerCase());
    if (!usuario) return;
    const actuales = usuario.roles.flatMap((r) =>
      r.rol === deRol && r.organizacion_id ? [r.organizacion_id] : [],
    );
    setElegidas((marcadas) => [...new Set([...marcadas, ...actuales])]);
  }

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={edicion ? "Editar rol" : "Asignar rol"}
      descripcion={
        edicion
          ? "Elegí en qué organizaciones tiene este rol. Las que desmarques dejan de tenerlo, pero la persona sigue siendo miembro."
          : "Si el email todavía no está registrado se lo da de alta, y queda como miembro de las organizaciones elegidas."
      }
      textoEnviar={edicion ? "Guardar" : "Asignar"}
      alEnviar={async () => {
        const limpio = email.trim().toLowerCase();
        const organizacionesDelRol = porOrganizacion ? elegidas : [];
        if (!EMAIL.test(limpio)) throw new Error("Ingresá un email válido.");
        if (!rol) throw new Error("Elegí un rol.");
        if (porOrganizacion && !organizacionesDelRol.length) {
          throw new Error(`El rol ${rol.nombre} requiere al menos una organización.`);
        }
        await asignar.mutateAsync({
          email: limpio,
          nombre: nombre.trim() || null,
          rol: rol.codigo,
          organizaciones: organizacionesDelRol,
        });
        toast.success(edicion ? "Rol actualizado." : `${limpio} ahora es ${rol.nombre}.`);
      }}
    >
      <Campo etiqueta="Email" requerido>
        {(props) => (
          <>
            <Input
              {...props}
              type="email"
              inputMode="email"
              list="emails-conocidos"
              autoComplete="off"
              autoFocus={!edicion}
              placeholder="nombre@gmail.com"
              disabled={Boolean(edicion)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => precargar(email, codigo)}
            />
            <datalist id="emails-conocidos">
              {usuarios.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.nombre ?? ""}
                </option>
              ))}
            </datalist>
          </>
        )}
      </Campo>
      {!edicion && !existente && (
        <Campo etiqueta="Nombre" ayuda="Opcional, sólo si es alguien nuevo.">
          {(props) => (
            <Input
              {...props}
              autoComplete="off"
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
      )}
      <Campo etiqueta="Rol" requerido ayuda={rol?.descripcion}>
        {(props) => (
          <Select
            {...props}
            disabled={Boolean(edicion)}
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              precargar(email, e.target.value);
            }}
          >
            {roles.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.nombre}
              </option>
            ))}
          </Select>
        )}
      </Campo>
      {porOrganizacion && (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">
            Organizaciones<span className="text-destructive"> *</span>
          </legend>
          <SelectorDeOrganizaciones
            organizaciones={organizaciones}
            seleccionadas={elegidas}
            alCambiar={setElegidas}
          />
        </fieldset>
      )}
    </DialogoDeFormulario>
  );
}

function ConfirmarQuitarRol({
  usuario,
  rol,
  codigo,
  alCerrar,
}: {
  usuario: Usuario;
  rol: Rol | undefined;
  codigo: string;
  alCerrar: () => void;
}) {
  const quitar = useQuitarRol();
  const nombre = rol?.nombre || codigo;
  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      ancho="sm"
      titulo={`¿Quitar el rol ${nombre}?`}
      descripcion={
        <>
          <strong className="text-foreground">{usuario.nombre || usuario.email}</strong> deja de ser {nombre}{" "}
          en todas sus organizaciones. Sigue siendo miembro de ellas: para sacarle el acceso usá "Quitar
          acceso" en la pestaña Usuarios.
        </>
      }
      textoEnviar="Quitar rol"
      destructivo
      alEnviar={async () => {
        await quitar.mutateAsync({ id: usuario.id, rol: codigo });
        toast.success("Rol quitado.");
      }}
    />
  );
}

// ── Organizaciones ────────────────────────────────────────

export function Organizaciones({ organizaciones }: { organizaciones: Organizacion[] }) {
  /** null = nueva; una organización = renombrar. */
  const [edicion, setEdicion] = useState<Organizacion | null>();

  return (
    <>
      <Seccion
        titulo="Organizaciones"
        descripcion="Cada organización tiene sus propios datos: pibes, asistencias y buffet."
        acciones={
          <Button onClick={() => setEdicion(null)}>
            <Plus aria-hidden />
            Nueva organización
          </Button>
        }
      />
      <Listado
        clave="admin-organizaciones"
        titulo="Organizaciones"
        items={organizaciones}
        idDe={(o) => o.id}
        vacio={
          <EstadoVacio icono={<Building2 />} titulo="No hay organizaciones">
            Creá la primera para poder asignarle usuarios.
          </EstadoVacio>
        }
        columnas={[
          { titulo: "Organización", celda: (o) => <Persona nombre={o.nombre} semilla={o.id} /> },
          { titulo: "Miembros", numerica: true, celda: (o) => o.miembros },
          { titulo: "Admins", numerica: true, celda: (o) => o.admins },
          {
            titulo: "",
            acciones: true,
            celda: (o) => (
              <Button variant="outline" size="sm" onClick={() => setEdicion(o)}>
                Renombrar
              </Button>
            ),
          },
        ]}
      />
      {edicion !== undefined && (
        <FormularioDeOrganizacion organizacion={edicion} alCerrar={() => setEdicion(undefined)} />
      )}
    </>
  );
}

function FormularioDeOrganizacion({
  organizacion,
  alCerrar,
}: {
  organizacion: Organizacion | null;
  alCerrar: () => void;
}) {
  const guardar = useGuardarOrganizacion();
  const [nombre, setNombre] = useState(organizacion?.nombre ?? "");

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      ancho="sm"
      titulo={organizacion ? "Renombrar organización" : "Nueva organización"}
      textoEnviar={organizacion ? "Guardar" : "Crear"}
      alEnviar={async () => {
        const limpio = nombre.trim();
        if (!limpio) throw new Error("El nombre es obligatorio.");
        await guardar.mutateAsync({ id: organizacion?.id, json: { nombre: limpio } });
        toast.success(organizacion ? "Organización renombrada." : `Se creó ${limpio}.`);
      }}
    >
      <Campo etiqueta="Nombre" requerido>
        {(props) => (
          <Input
            {...props}
            autoFocus
            maxLength={80}
            autoComplete="off"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        )}
      </Campo>
      {!organizacion && (
        <Alerta tono="info">
          Después asignale un administrador desde la pestaña Roles para que pueda dar de alta a su gente.
        </Alerta>
      )}
    </DialogoDeFormulario>
  );
}
