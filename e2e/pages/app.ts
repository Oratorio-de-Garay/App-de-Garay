import { expect, type Locator, type Page } from "@playwright/test";

// Objetos de página: lo único que conoce cómo está armada la interfaz. Los
// specs hablan en términos de lo que hace una persona, así al cambiar una
// pantalla sólo se toca este archivo.

/** El diálogo abierto (formulario o confirmación). */
const dialogo = (page: Page): Locator => page.getByRole("dialog").or(page.getByRole("alertdialog"));

/** Responde la confirmación de una acción destructiva. */
async function confirmar(page: Page, boton: string): Promise<void> {
  await page.getByRole("alertdialog").getByRole("button", { name: boton, exact: true }).click();
}

export class Login {
  constructor(private page: Page) {}

  mail = (): Locator => this.page.getByLabel("Tu mail");
  codigo = (): Locator => this.page.getByLabel("Código de 6 dígitos");

  async abrir(): Promise<void> {
    await this.page.goto("/");
    await expect(this.mail()).toBeVisible();
  }

  async pedirCodigo(email: string): Promise<void> {
    await this.mail().fill(email);
    // Auth no manda dos códigos al mismo mail en menos de 1 s (max_frequency):
    // si otro test acaba de generar uno, se reintenta.
    await expect(async () => {
      await this.page.getByRole("button", { name: "Enviar código" }).click();
      await expect(this.codigo()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 12_000, intervals: [1200] });
  }

  async entrarCon(codigo: string): Promise<void> {
    await this.codigo().fill(codigo);
    await this.page.getByRole("button", { name: "Entrar", exact: true }).click();
  }

  async salir(): Promise<void> {
    // En el celular "Salir" está dentro del menú.
    const abrirMenu = this.page.getByRole("button", { name: "Abrir menú" });
    if (await abrirMenu.isVisible()) await abrirMenu.click();
    await this.page.getByRole("button", { name: "Salir" }).click();
  }
}

export class Asistencia {
  constructor(private page: Page) {}

  buscador = (): Locator => this.page.getByRole("searchbox", { name: "Buscar por nombre o apellido" });
  /** El botón de presente de la ficha abierta. */
  botonPresente = (): Locator => this.page.getByRole("button", { name: /(Marcar|Desmarcar) presente/ });

  async abrir(): Promise<void> {
    await this.page.goto("/");
    await expect(this.buscador()).toBeVisible();
  }

  async buscar(texto: string): Promise<void> {
    await this.buscador().fill(texto);
  }

  async confirmarBusqueda(): Promise<void> {
    await this.page.getByRole("button", { name: "Buscar", exact: true }).click();
  }

  async darDeAlta(nombre: string, apellido: string): Promise<void> {
    await this.page.getByRole("button", { name: "Nuevo chico" }).click();
    await this.page.getByLabel("Nombre", { exact: true }).fill(nombre);
    await this.page.getByLabel("Apellido", { exact: true }).fill(apellido);
    await this.page.getByRole("button", { name: /Agregar y marcar presente/ }).click();
  }

  async abrirFicha(nombreCompleto: string): Promise<void> {
    await this.page.getByRole("row").filter({ hasText: nombreCompleto }).getByText(nombreCompleto).click();
    await expect(this.page.getByRole("heading", { name: nombreCompleto })).toBeVisible();
  }

  /** Marca el presente, o lo desmarca confirmando la pregunta. */
  async alternarPresente(): Promise<void> {
    const desmarca = /Desmarcar/.test((await this.botonPresente().textContent()) ?? "");
    await this.botonPresente().click();
    if (desmarca) await confirmar(this.page, "Desmarcar");
  }

  async abrirHistorial(): Promise<void> {
    await this.page.getByRole("button", { name: "Historial" }).click();
  }
}

export class Buffet {
  constructor(private page: Page) {}

  async abrir(): Promise<void> {
    await this.page.goto("/buffet");
    await expect(this.page.getByRole("button", { name: "Nuevo producto" })).toBeVisible();
  }

  filaProducto = (nombre: string): Locator => this.page.getByRole("row").filter({ hasText: nombre });

  async crearProducto(nombre: string, precio: string): Promise<void> {
    await this.page.getByRole("button", { name: "Nuevo producto" }).click();
    await dialogo(this.page)
      .getByLabel(/^Nombre/)
      .fill(nombre);
    await dialogo(this.page).getByLabel("Precio de venta").fill(precio);
    await dialogo(this.page).getByRole("button", { name: "Guardar" }).click();
  }

  async abrirVentas(): Promise<void> {
    await this.page.getByRole("tab", { name: "Ventas" }).click();
  }

  /** Crea el evento y queda adentro, listo para cargar ventas. */
  async crearEvento(nombre: string): Promise<void> {
    await this.page.getByRole("button", { name: "Nuevo evento" }).click();
    await dialogo(this.page)
      .getByLabel(/^Nombre/)
      .fill(nombre);
    await dialogo(this.page).getByRole("button", { name: "Crear evento" }).click();
    await expect(this.page.getByRole("heading", { name: nombre })).toBeVisible();
  }

  filaDeEvento = (nombre: string): Locator => this.page.getByRole("row").filter({ hasText: nombre });

  /** Con el evento abierto: lo edita y lo pasa a cerrado (sólo lo puede un admin). */
  async cerrarEvento(): Promise<void> {
    await this.page.getByRole("button", { name: "Editar evento" }).click();
    await dialogo(this.page).getByLabel("Estado").selectOption("cerrado");
    await dialogo(this.page).getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo(this.page)).toBeHidden();
  }

  /** Carga una venta de un solo producto con la cantidad indicada. */
  async registrarVenta(producto: string, cantidad: number): Promise<void> {
    await this.page.getByRole("button", { name: "Nueva venta" }).click();
    await dialogo(this.page).getByLabel("Agregar ítem").selectOption({ label: producto });
    for (let i = 1; i < cantidad; i++) {
      await dialogo(this.page).getByRole("button", { name: "Sumar cantidad" }).click();
    }
  }

  totalDeLaVenta = (): Locator => dialogo(this.page).getByText("Total", { exact: true }).locator("..");

  async confirmarVenta(): Promise<void> {
    await dialogo(this.page).getByRole("button", { name: "Registrar venta" }).click();
    await expect(dialogo(this.page)).toBeHidden();
  }

  /** El resumen del evento abierto (nombre, cantidad de ventas y recaudado). */
  resumenDelEvento = (nombre: string): Locator =>
    this.page.getByRole("heading", { name: nombre }).locator("../..");

  async eliminarProducto(nombre: string): Promise<void> {
    await this.filaProducto(nombre).getByRole("button", { name: "Eliminar" }).click();
    await confirmar(this.page, "Eliminar");
  }
}

/** El menú de secciones (en el celular hay que abrirlo). */
export class Menu {
  constructor(private page: Page) {}

  async irA(seccion: "Registro" | "Buffet" | "Administración"): Promise<void> {
    const abrir = this.page.getByRole("button", { name: "Abrir menú" });
    if (await abrir.isVisible()) await abrir.click();
    await this.page.getByRole("link", { name: seccion }).click();
  }
}

export class Admin {
  constructor(private page: Page) {}

  async abrir(): Promise<void> {
    await this.page.goto("/admin");
  }

  filaUsuario = (email: string): Locator => this.page.getByRole("row").filter({ hasText: email });

  async darDeAlta(email: string, nombre: string): Promise<void> {
    await this.page.getByRole("button", { name: "Dar de alta" }).click();
    await dialogo(this.page)
      .getByLabel(/Email de Google/)
      .fill(email);
    await dialogo(this.page)
      .getByLabel(/^Nombre/)
      .fill(nombre);
    await dialogo(this.page).getByRole("button", { name: "Dar de alta", exact: true }).click();
  }

  async quitarAcceso(email: string): Promise<void> {
    await this.filaUsuario(email).getByRole("button", { name: "Quitar acceso" }).click();
    await dialogo(this.page).getByRole("button", { name: "Quitar acceso" }).click();
  }
}
