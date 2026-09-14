import { BraveSearchError } from '../brave/client.js';

export class SerperError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SerperError';
  }
}

export interface SerperClientOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = 'https://api.serper.dev/search';

export class SerperClient {
  private endpoint: string;
  private timeoutMs: number;
  private maxRetries: number;
  private fetchImpl: typeof fetch;

  constructor(private readonly options: SerperClientOptions) {
    if (!options.apiKey || !options.apiKey.trim()) throw new Error('SERPER_API_KEY is required');
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(body: any): Promise<any> {
    const url = new URL(this.endpoint);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(String(url), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-KEY': this.options.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          if ([408, 429, 500, 502, 503, 504].includes(res.status) && attempt < this.maxRetries) {
            // retry
          } else {
            throw new SerperError(`Serper request failed with HTTP ${res.status}`, res.status);
          }
        } else {
          const data = await res.json();
          return data;
        }
      } catch (err) {
        if (attempt === this.maxRetries) {
          if (err instanceof SerperError) throw err;
          throw new SerperError(`Serper request failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      } finally {
        clearTimeout(timer);
      }
      // backoff
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
    throw new SerperError('Serper request exhausted retries');
  }

  async searchShopping(query: string, num = 10, page = 1): Promise<any> {
    const body = { q: query, num, page, type: 'shopping' };
    return this.request(body);
  }
}

export default SerperClient;
