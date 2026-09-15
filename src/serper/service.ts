import SerperClient, { SerperClientOptions, SerperError } from './client.js';
import normalizeSerperShopping, { NormalizeOptions } from '../normalizers/serperNormalizer.js';
import { BraveSearchClient } from '../brave/client.js';

export interface SerperServiceOptions extends SerperClientOptions {
  braveClient?: BraveSearchClient;
  /** Ajustes da normalização (limite de validações Brave, cache). */
  normalization?: NormalizeOptions;
}

export class SerperService {
  private client: SerperClient;
  private braveClient?: BraveSearchClient;
  private normalization?: NormalizeOptions;

  constructor(options: SerperServiceOptions) {
    this.client = new SerperClient(options);
    this.braveClient = options.braveClient;
    this.normalization = options.normalization;
  }

  async searchAndNormalize(query: string) {
    const res = await this.client.searchShopping(query);
    const shopping = res?.shopping ?? [];
    return normalizeSerperShopping(shopping, this.braveClient, this.normalization);
  }
}

export default SerperService;
