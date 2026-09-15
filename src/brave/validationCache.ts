import type { ValidatedLink } from './types.js';

export interface ValidationCacheOptions {
  /** Tempo de vida de cada entrada (padrão: 24h). */
  ttlMs?: number;
  /** Número máximo de entradas antes de descartar a mais antiga (padrão: 500). */
  maxEntries?: number;
}

/**
 * Cache em memória das validações do Brave, chaveado por produto + domínio.
 *
 * Objetivo: proteger o orçamento do Brave ($10/mês) — o mesmo item costuma ser
 * cotado várias vezes e não faz sentido revalidar a cada cotação.
 */
export class ValidationCache {
  private readonly store = new Map<string, { value: ValidatedLink; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: ValidationCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 500;
  }

  static key(product: string, domain: string): string {
    return `${product.trim().toLowerCase()}|${domain.trim().toLowerCase()}`;
  }

  get(product: string, domain: string): ValidatedLink | undefined {
    const key = ValidationCache.key(product, domain);
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(product: string, domain: string, value: ValidatedLink): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(ValidationCache.key(product, domain), {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

export default ValidationCache;
