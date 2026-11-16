/**
 * Caché en memoria con vencimiento y tope de entradas (se descarta la más
 * vieja). Vive lo que la instancia serverless esté caliente.
 */
export class CacheTTL<V> {
  private readonly entradas = new Map<string, { vence: number; valor: V }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maximo: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  get(clave: string): V | undefined {
    const entrada = this.entradas.get(clave);
    if (!entrada) return undefined;
    if (entrada.vence < this.ahora()) {
      this.entradas.delete(clave);
      return undefined;
    }
    return entrada.valor;
  }

  set(clave: string, valor: V): void {
    if (!this.entradas.has(clave) && this.entradas.size >= this.maximo) {
      const masVieja = this.entradas.keys().next().value;
      if (masVieja !== undefined) this.entradas.delete(masVieja);
    }
    this.entradas.set(clave, { vence: this.ahora() + this.ttlMs, valor });
  }

  delete(clave: string): void {
    this.entradas.delete(clave);
  }

  clear(): void {
    this.entradas.clear();
  }

  get size(): number {
    return this.entradas.size;
  }
}
