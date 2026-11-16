import { Lock, Plus, Search, SearchX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DialogoDeFormulario } from "@/components/dialogos";
import { Listado } from "@/components/listado";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campos";
import { Alerta, EstadoVacio, Persona } from "@/components/ui/varios";
import { normalizarBusqueda } from "@/lib/formato";
import { InsigniaDeRol, ListaDeChips, SelectorDeOrganizaciones } from "./comunes";
import {
  type Organizacion,
  type Usuario,
  useAltaDeUsuario,
  useEditarUsuario,
  useQuitarAcceso,
} from "./consultas";
import { EMAIL } from "./textos";

type Accion = { tipo: "alta" } | { tipo: "editar"; usuario: Usuario } | { tipo: "quitar"; usuario: Usuario };

export function Usuarios({
  usuarios,
  organizaciones,
}: {
  usuarios: Usuario[];
  organizaciones: Organizacion[];
}) {
  const [texto, setTexto] = useState("");
  const [organizacion, setOrganizacion] = useState("");
  const [accion, setAccion] = useState<Accion>();

  const visibles = useMemo(() => {
    const buscado = normalizarBusqueda(texto);
    return usuarios.filter((u) => {
      if (organizacion && !u.organizaciones.some((o) => o.id === organizacion)) return false;
      return !buscado || normalizarBusqueda(`${u.nombre ?? ""} ${u.email}`).includes(buscado);
    });
  }, [usuarios, texto, organizacion]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar usuarios"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        {organizaciones.length > 1 && (
          <Select
            className="w-full sm:w-64"
            aria-label="Filtrar por organización"
            value={organizacion}
            onChange={(e) => setOrganizacion(e.target.value)}
          >
            <option value="">Todas las organizaciones</option>
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
        )}
        <Button onClick={() => setAccion({ tipo: "alta" })}>
          <Plus aria-hidden />
          Dar de alta
        </Button>
      </div>

      <Listado
        clave="admin-usuarios"
        titulo="Usuarios"
        items={visibles}
        idDe={(u) => u.id}
        vacio={
          usuarios.length ? (
            <EstadoVacio icono={<SearchX />} titulo="Sin resultados">
              Ningún usuario coincide con la búsqueda.
            </EstadoVacio>
          ) : (
            <EstadoVacio icono={<Users />} titulo="Todavía no hay usuarios">
              Dá de alta el primer email para que esa persona pueda entrar con su cuenta de Google.
            </EstadoVacio>
          )
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
            celda: (u) =>
              u.roles.length ? (
                <div className="flex flex-wrap justify-end gap-1 md:justify-start">
                  {/* Un rol puede repetirse por organización: se muestra una vez. */}
                  {[...new Map(u.roles.map((r) => [r.rol, r])).values()].map((r) => (
                    <InsigniaDeRol key={r.rol} rol={r.rol} nombre={r.nombre} />
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">Sin roles</span>
              ),
          },
          { titulo: "Organizaciones", celda: (u) => <ListaDeChips organizaciones={u.organizaciones} /> },
          {
            titulo: "",
            acciones: true,
            celda: (u) =>
              u.editable ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAccion({ tipo: "editar", usuario: u })}
                  >
                    Editar
                  </Button>
                  {u.organizaciones.length > 0 && (
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => setAccion({ tipo: "quitar", usuario: u })}
                    >
                      Quitar acceso
                    </Button>
                  )}
                </>
              ) : (
                <span
                  className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
                  title="Sólo un superadmin puede modificar a un administrador"
                >
                  <Lock className="size-3.5" aria-hidden />
                  Sólo superadmin
                </span>
              ),
          },
        ]}
      />

      {accion?.tipo === "quitar" ? (
        <ConfirmarQuitarAcceso usuario={accion.usuario} alCerrar={() => setAccion(undefined)} />
      ) : (
        accion && (
          <FormularioDeUsuario
            usuario={accion.tipo === "editar" ? accion.usuario : null}
            organizaciones={organizaciones}
            alCerrar={() => setAccion(undefined)}
          />
        )
      )}
    </>
  );
}

/** Alta (usuario = null) o edición. */
function FormularioDeUsuario({
  usuario,
  organizaciones,
  alCerrar,
}: {
  usuario: Usuario | null;
  organizaciones: Organizacion[];
  alCerrar: () => void;
}) {
  const alta = useAltaDeUsuario();
  const editar = useEditarUsuario();
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  // En el alta, si administra una sola organización se la preselecciona.
  const [elegidas, setElegidas] = useState<string[]>(() =>
    usuario
      ? usuario.organizaciones.map((o) => o.id)
      : organizaciones.length === 1
        ? [organizaciones[0]!.id]
        : [],
  );
  // Desmarcar todo equivale a quitarle el acceso: se avisa y cambia el botón.
  const quedaSinAcceso = Boolean(usuario && usuario.organizaciones.length > 0 && elegidas.length === 0);

  async function guardar() {
    if (usuario) {
      const r = await editar.mutateAsync({
        id: usuario.id,
        json: { nombre: nombre.trim(), organizaciones: elegidas },
      });
      toast.success(
        r.eliminado ? `${usuario.email} ya no tiene acceso a la aplicación.` : "Cambios guardados.",
      );
      return;
    }
    const limpio = email.trim().toLowerCase();
    if (!EMAIL.test(limpio)) throw new Error("Ingresá un email válido.");
    if (!elegidas.length) throw new Error("Elegí al menos una organización.");
    const r = await alta.mutateAsync({ email: limpio, nombre: nombre.trim(), organizaciones: elegidas });
    if (r.creado) toast.success(`Listo: ${limpio} ya puede entrar con Google.`);
    else if (r.organizaciones_agregadas)
      toast.success(`${limpio} ya estaba registrado: se le agregó el acceso.`);
    else toast.info(`${limpio} ya tenía acceso a esas organizaciones.`);
  }

  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      titulo={usuario ? "Editar usuario" : "Dar de alta un usuario"}
      descripcion={
        usuario
          ? "Los cambios de organizaciones sólo afectan a las que vos administrás."
          : "Habilitá un email de Google. Cuando esa persona inicie sesión va a entrar directo a las organizaciones que elijas."
      }
      textoEnviar={!usuario ? "Dar de alta" : quedaSinAcceso ? "Quitar acceso" : "Guardar cambios"}
      destructivo={quedaSinAcceso}
      alEnviar={guardar}
    >
      <Campo etiqueta="Email de Google" requerido>
        {(props) => (
          <Input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoFocus={!usuario}
            placeholder="nombre@gmail.com"
            disabled={Boolean(usuario)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Campo>
      <Campo etiqueta="Nombre (opcional)">
        {(props) => (
          <Input
            {...props}
            autoComplete="off"
            maxLength={120}
            placeholder="Ej: María Pérez — catequista de 3°"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        )}
      </Campo>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Organizaciones<span className="text-destructive"> *</span>
        </legend>
        <SelectorDeOrganizaciones
          organizaciones={organizaciones}
          seleccionadas={elegidas}
          alCambiar={setElegidas}
        />
        <p className="text-[13px] text-muted-foreground">
          Sólo va a poder ver los datos de las organizaciones marcadas.
        </p>
      </fieldset>
      {quedaSinAcceso && (
        <Alerta tono="aviso">
          Sin organizaciones esta persona pierde el acceso a lo que vos administrás. Si no le queda ninguna
          otra, ya no va a poder entrar a la aplicación.
        </Alerta>
      )}
    </DialogoDeFormulario>
  );
}

function ConfirmarQuitarAcceso({ usuario, alCerrar }: { usuario: Usuario; alCerrar: () => void }) {
  const quitar = useQuitarAcceso();
  return (
    <DialogoDeFormulario
      abierto
      alCerrar={alCerrar}
      ancho="sm"
      titulo="¿Quitar el acceso?"
      descripcion={
        <>
          <strong className="text-foreground">{usuario.nombre || usuario.email}</strong> va a dejar de tener
          acceso a{" "}
          <strong className="text-foreground">
            {usuario.organizaciones.map((o) => o.nombre).join(", ")}
          </strong>
          . Si no pertenece a ninguna otra organización, ya no va a poder entrar a la aplicación.
        </>
      }
      textoEnviar="Quitar acceso"
      destructivo
      alEnviar={async () => {
        const r = await quitar.mutateAsync(usuario.id);
        toast.success(
          r.eliminado
            ? `${usuario.email} ya no tiene acceso a la aplicación.`
            : `Se quitó el acceso de ${usuario.email}.`,
        );
      }}
    />
  );
}
