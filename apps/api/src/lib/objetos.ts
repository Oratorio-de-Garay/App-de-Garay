/**
 * Copia sin las claves en `undefined`. Para las ediciones parciales: sólo se
 * manda a la base lo que vino en el pedido.
 */
export function soloDefinidos<T extends object>(objeto: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
