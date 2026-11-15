// Cálculo de una venta de buffet. Lo usan la API (que es la autoridad: nunca
// confía en los totales del cliente) y el carrito, para mostrar el mismo total.

export interface ItemVentaCrudo {
  product_id?: string | null;
  combo_id?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
}

export interface ItemVenta {
  product_id: string | null;
  combo_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

const redondear = (valor: number) => Number(valor.toFixed(2));

/**
 * Normaliza los ítems y recalcula los totales. Cantidades y precios van en
 * enteros: no se venden medias porciones ni se cobran centavos en una feria.
 * Se descartan los ítems sin cantidad o que no apuntan a un producto o combo.
 */
export function normalizarItemsVenta(crudos: readonly ItemVentaCrudo[] | null | undefined): {
  items: ItemVenta[];
  total: number;
} {
  const items = (crudos ?? [])
    .map((item): ItemVenta => {
      const quantity = Math.round(Number(item.quantity) || 0);
      const unitPrice = Math.round(Number(item.unit_price) || 0);
      return {
        product_id: item.product_id || null,
        combo_id: item.combo_id || null,
        description: item.description || "Sin descripción",
        quantity,
        unit_price: unitPrice,
        line_total: redondear(quantity * unitPrice),
      };
    })
    .filter((item) => item.quantity > 0 && Boolean(item.product_id || item.combo_id));

  return { items, total: redondear(items.reduce((acc, item) => acc + item.line_total, 0)) };
}
