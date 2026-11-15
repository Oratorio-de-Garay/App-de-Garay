import { expect, type Locator, type Page } from "@playwright/test";

// Objetos de página: lo único que conoce el HTML de la app. Los specs hablan
// en términos de lo que hace una persona, así al cambiar la interfaz sólo se
// toca este archivo.

/** Acepta los diálogos nativos de confirmación (la app actual usa confirm()). */
export function aceptarDialogos(page: Page): void {
  page.on("dialog", (dialogo) => dialogo.accept());
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
}

export class Asistencia {
  constructor(private page: Page) {}

  buscador = (): Locator => this.page.getByPlaceholder("Nombre o Apellido del pibe...");
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
    await expect(this.botonPresente()).toBeVisible();
  }

  async abrirHistorial(): Promise<void> {
    await this.page.getByRole("button", { name: "Historial" }).click();
  }
}

export class Buffet {
  constructor(private page: Page) {}

  async abrir(): Promise<void> {
    await this.page.goto("/buffet.html");
    await expect(this.page.getByRole("button", { name: "Nuevo producto" })).toBeVisible();
  }

  filaProducto = (nombre: string): Locator => this.page.getByRole("row").filter({ hasText: nombre });

  async crearProducto(nombre: string, precio: string): Promise<void> {
    await this.page.getByRole("button", { name: "Nuevo producto" }).click();
    await this.page.getByLabel("Nombre *").fill(nombre);
    await this.page.getByLabel("Precio de venta").fill(precio);
    await this.page.getByRole("button", { name: "Guardar" }).click();
  }

  async eliminarProducto(nombre: string): Promise<void> {
    await this.filaProducto(nombre).getByRole("button", { name: "Eliminar" }).click();
  }
}

export class Admin {
  constructor(private page: Page) {}

  async abrir(): Promise<void> {
    await this.page.goto("/admin.html");
  }

  filaUsuario = (email: string): Locator => this.page.getByRole("row").filter({ hasText: email });

  async darDeAlta(email: string, nombre: string): Promise<void> {
    await this.page.getByRole("button", { name: "+ Dar de alta" }).click();
    await this.page.getByLabel(/Email de Google/).fill(email);
    await this.page.getByLabel(/^Nombre/).fill(nombre);
    await this.page.getByRole("button", { name: "Dar de alta", exact: true }).click();
  }

  async quitarAcceso(email: string): Promise<void> {
    await this.filaUsuario(email).getByRole("button", { name: "Quitar acceso" }).click();
    // Confirmación en el modal.
    await this.page.locator(".modal, [role=dialog]").getByRole("button", { name: "Quitar acceso" }).click();
  }
}
