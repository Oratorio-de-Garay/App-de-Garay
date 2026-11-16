// Carrito de una venta. Lógica pura (sin React) para poder probarla sola.

export interface ItemDeCarrito {
  product_id: string | null;
  combo_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

/** Algo que se puede vender: un producto o un combo. */
export interface Vendible {
  /** "p:<id>" o "c:<id>". */
  clave: string;
  nombre: string;
  precio: number;
  activo: boolean;
}

export const claveDe = (item: Pick<ItemDeCarrito, "product_id" | "combo_id">) =>
  item.combo_id ? `c:${item.combo_id}` : `p:${item.product_id}`;

const precioEntero = (precio: number | string | null | undefined) =>
  Math.max(0, Math.round(Number(precio) || 0));

export function vendibles(
  productos: readonly { id: string; name: string; sale_price: number; active: boolean }[],
  combos: readonly { id: string; name: string; sale_price: number; active: boolean }[],
): Vendible[] {
  return [
    ...productos.map((p) => ({
      clave: `p:${p.id}`,
      nombre: p.name,
      precio: precioEntero(p.sale_price),
      activo: p.active,
    })),
    ...combos.map((c) => ({
      clave: `c:${c.id}`,
      nombre: `Combo · ${c.name}`,
      precio: precioEntero(c.sale_price),
      activo: c.active,
    })),
  ];
}

function aItem(vendible: Vendible, cantidad: number): ItemDeCarrito {
  const [tipo, id = ""] = vendible.clave.split(":");
  return {
    product_id: tipo === "p" ? id : null,
    combo_id: tipo === "c" ? id : null,
    description: vendible.nombre,
    quantity: cantidad,
    unit_price: vendible.precio,
  };
}

/**
 * Agrega al carrito con cantidad 1 y precio de lista. Si ya estaba, suma una
 * unidad en vez de duplicar la línea.
 */
export function agregar(carrito: readonly ItemDeCarrito[], vendible: Vendible): ItemDeCarrito[] {
  const yaEsta = carrito.some((item) => claveDe(item) === vendible.clave);
  return yaEsta
    ? carrito.map((item) =>
        claveDe(item) === vendible.clave ? { ...item, quantity: item.quantity + 1 } : item,
      )
    : [...carrito, aItem(vendible, 1)];
}

/** Cambia el producto de una línea: trae el precio de lista del nuevo y conserva la cantidad. */
export function cambiarProducto(
  carrito: readonly ItemDeCarrito[],
  indice: number,
  vendible: Vendible,
): ItemDeCarrito[] {
  return carrito.map((item, i) => (i === indice ? aItem(vendible, item.quantity) : item));
}

export function cambiarLinea(
  carrito: readonly ItemDeCarrito[],
  indice: number,
  cambios: Partial<Pick<ItemDeCarrito, "quantity" | "unit_price">>,
): ItemDeCarrito[] {
  return carrito.map((item, i) => (i === indice ? { ...item, ...cambios } : item));
}

export const quitar = (carrito: readonly ItemDeCarrito[], indice: number) =>
  carrito.filter((_, i) => i !== indice);

export const totalDeLinea = (item: ItemDeCarrito) => item.quantity * item.unit_price;
export const total = (carrito: readonly ItemDeCarrito[]) =>
  carrito.reduce((acc, item) => acc + totalDeLinea(item), 0);

/**
 * Qué se ofrece para AGREGAR: sólo lo activo que todavía no está en la venta
 * (lo ya cargado se modifica desde su propia línea).
 */
export function opcionesParaAgregar(
  todos: readonly Vendible[],
  carrito: readonly ItemDeCarrito[],
): Vendible[] {
  const cargados = new Set(carrito.map(claveDe));
  return todos.filter((v) => v.activo && !cargados.has(v.clave));
}

/**
 * Qué se ofrece en el selector de una línea: lo activo más lo que la línea ya
 * tiene, aunque se haya desactivado o borrado después (si no, editar una venta
 * vieja lo perdería).
 */
export function opcionesDeLinea(todos: readonly Vendible[], item: ItemDeCarrito): Vendible[] {
  const propia = claveDe(item);
  const opciones = todos.filter((v) => v.activo || v.clave === propia);
  if (!opciones.some((v) => v.clave === propia)) {
    opciones.push({ clave: propia, nombre: item.description, precio: item.unit_price, activo: false });
  }
  return opciones;
}

/**
 * Vuelto de un pago en efectivo. Es sólo una ayuda para quien cobra: no se
 * guarda. null si todavía no se cargó con cuánto pagó.
 */
export function vuelto(totalVenta: number, pagoCon: number): { falta: boolean; monto: number } | null {
  if (!(pagoCon > 0)) return null;
  const diferencia = pagoCon - totalVenta;
  return { falta: diferencia < 0, monto: Math.abs(diferencia) };
}

/** Por qué no se puede guardar la venta, o null si está bien. */
export function problemaDelCarrito(carrito: readonly ItemDeCarrito[]): string | null {
  if (!carrito.length) return "Agregá al menos un ítem a la venta.";
  if (carrito.some((item) => item.quantity <= 0)) return "La cantidad de cada ítem debe ser mayor a cero.";
  return null;
}
