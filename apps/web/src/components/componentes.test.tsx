import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DialogoDeFormulario, ProveedorDeConfirmacion, useConfirmar } from "./dialogos";
import { Listado, paginar } from "./listado";
import { Stepper } from "./stepper";

describe("paginar", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("recorta la página pedida", () => {
    expect(paginar(items, 2, 10)).toMatchObject({ pagina: 2, paginas: 3, desde: 10, hasta: 20 });
    expect(paginar(items, 3, 10).visibles).toEqual([21, 22, 23, 24, 25]);
  });

  it("si la página quedó fuera de rango usa la última (o la primera)", () => {
    expect(paginar(items, 9, 10).pagina).toBe(3);
    expect(paginar(items, 0, 10).pagina).toBe(1);
    expect(paginar([], 4, 10)).toMatchObject({ pagina: 1, paginas: 1, visibles: [] });
  });
});

describe("Listado", () => {
  const personas = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, nombre: `Persona ${i + 1}` }));
  const columnas = [{ titulo: "Nombre", celda: (p: { nombre: string }) => p.nombre }];
  const montar = (alTocarFila?: (p: { id: number }) => void) =>
    render(
      <Listado
        clave="prueba"
        items={personas}
        columnas={columnas}
        idDe={(p) => p.id}
        alTocarFila={alTocarFila}
      />,
    );

  it("muestra la primera página y permite avanzar", async () => {
    const usuario = userEvent.setup();
    montar();
    expect(screen.getAllByRole("row")).toHaveLength(11); // encabezado + 10
    expect(screen.getAllByText("1–10 de 23")).not.toHaveLength(0);

    await usuario.click(screen.getAllByRole("button", { name: "Página siguiente" })[0]!);
    expect(screen.getByText("Persona 11")).toBeInTheDocument();
    expect(screen.queryByText("Persona 1")).not.toBeInTheDocument();
  });

  it("recuerda el tamaño de página elegido en el dispositivo", async () => {
    const usuario = userEvent.setup();
    const { unmount } = montar();
    await usuario.selectOptions(screen.getByLabelText("Ítems por página"), "25");
    expect(screen.getAllByRole("row")).toHaveLength(24);
    expect(localStorage.getItem("paginacion:prueba")).toBe("25");

    unmount();
    montar();
    expect(screen.getAllByRole("row")).toHaveLength(24);
  });

  it("tocar una fila avisa, pero tocar un botón de la fila no", async () => {
    const usuario = userEvent.setup();
    const alTocar = vi.fn();
    const alBoton = vi.fn();
    render(
      <Listado
        clave="prueba-2"
        items={personas.slice(0, 2)}
        idDe={(p) => p.id}
        alTocarFila={alTocar}
        columnas={[
          ...columnas,
          { titulo: "", acciones: true, celda: () => <button onClick={alBoton}>Marcar</button> },
        ]}
      />,
    );
    await usuario.click(screen.getByText("Persona 2"));
    expect(alTocar).toHaveBeenCalledWith(personas[1]);

    await usuario.click(screen.getAllByRole("button", { name: "Marcar" })[0]!);
    expect(alBoton).toHaveBeenCalledTimes(1);
    expect(alTocar).toHaveBeenCalledTimes(1);
  });

  it("sin items muestra el estado vacío", () => {
    render(
      <Listado clave="vacio" items={[]} columnas={columnas} idDe={() => 0} vacio={<p>No hay nadie</p>} />,
    );
    expect(screen.getByText("No hay nadie")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Stepper", () => {
  function Prueba({ inicial = 1, paso = 1, minimo = 1 }) {
    const [valor, setValor] = useState(inicial);
    return (
      <>
        <Stepper etiqueta="cantidad" valor={valor} alCambiar={setValor} paso={paso} minimo={minimo} />
        <output>{valor}</output>
      </>
    );
  }

  it("suma y resta de a un paso sin bajar del mínimo", async () => {
    const usuario = userEvent.setup();
    render(<Prueba paso={50} minimo={0} inicial={50} />);
    await usuario.click(screen.getByRole("button", { name: "Sumar cantidad" }));
    expect(screen.getByRole("status")).toHaveTextContent("100");
    await usuario.click(screen.getByRole("button", { name: "Restar cantidad" }));
    await usuario.click(screen.getByRole("button", { name: "Restar cantidad" }));
    expect(screen.getByRole("status")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Restar cantidad" })).toBeDisabled();
  });

  it("deja escribir, y al salir del campo corrige lo inválido", async () => {
    const usuario = userEvent.setup();
    render(<Prueba />);
    const campo = screen.getByRole("spinbutton", { name: "cantidad" });
    await usuario.clear(campo);
    await usuario.type(campo, "12");
    expect(screen.getByRole("status")).toHaveTextContent("12");

    await usuario.clear(campo);
    await usuario.tab();
    expect(campo).toHaveValue(1);
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });
});

describe("DialogoDeFormulario", () => {
  it("si guardar sale bien, se cierra", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <DialogoDeFormulario abierto titulo="Nuevo" alCerrar={alCerrar} alEnviar={() => Promise.resolve()} />,
    );
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("si guardar falla, queda abierto mostrando el error", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <DialogoDeFormulario
        abierto
        titulo="Nuevo"
        alCerrar={alCerrar}
        alEnviar={() => Promise.reject(new Error("El nombre es obligatorio."))}
      />,
    );
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio.");
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it("la acción secundaria corre lo suyo y también cierra", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    const rechazar = vi.fn().mockResolvedValue(undefined);
    const aceptar = vi.fn();
    render(
      <DialogoDeFormulario
        abierto
        titulo="Solicitud"
        alCerrar={alCerrar}
        textoEnviar="Aceptar"
        alEnviar={aceptar}
        accionSecundaria={{ texto: "Rechazar", alTocar: rechazar }}
      />,
    );
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(rechazar).toHaveBeenCalledTimes(1);
    expect(aceptar).not.toHaveBeenCalled();
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});

describe("useConfirmar", () => {
  function Prueba({ alResponder }: { alResponder: (respuesta: boolean) => void }) {
    const confirmar = useConfirmar();
    return (
      <button
        onClick={async () =>
          alResponder(await confirmar({ titulo: "¿Eliminar este producto?", textoConfirmar: "Eliminar" }))
        }
      >
        Borrar
      </button>
    );
  }
  const montar = (alResponder: (respuesta: boolean) => void) =>
    render(
      <ProveedorDeConfirmacion>
        <Prueba alResponder={alResponder} />
      </ProveedorDeConfirmacion>,
    );

  it("resuelve true al confirmar", async () => {
    const usuario = userEvent.setup();
    const alResponder = vi.fn();
    montar(alResponder);
    await usuario.click(screen.getByRole("button", { name: "Borrar" }));
    const pregunta = await screen.findByRole("alertdialog");
    expect(pregunta).toHaveTextContent("¿Eliminar este producto?");
    await usuario.click(within(pregunta).getByRole("button", { name: "Eliminar" }));
    expect(alResponder).toHaveBeenCalledWith(true);
  });

  it("resuelve false al cancelar o al cerrar con Escape", async () => {
    const usuario = userEvent.setup();
    const alResponder = vi.fn();
    montar(alResponder);
    await usuario.click(screen.getByRole("button", { name: "Borrar" }));
    await usuario.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }),
    );
    expect(alResponder).toHaveBeenLastCalledWith(false);

    await usuario.click(screen.getByRole("button", { name: "Borrar" }));
    await screen.findByRole("alertdialog");
    await usuario.keyboard("{Escape}");
    expect(alResponder).toHaveBeenLastCalledWith(false);
    expect(alResponder).toHaveBeenCalledTimes(2);
  });
});
