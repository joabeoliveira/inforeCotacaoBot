import SerperClient, { SerperClientOptions, SerperError } from './client.js';
import normalizeSerperShopping from '../normalizers/serperNormalizer.js';
import { BraveSearchClient } from '../brave/client.js';

export interface SerperServiceOptions extends SerperClientOptions {
  braveClient?: BraveSearchClient;
}

export class SerperService {
  private client: SerperClient;
  private braveClient?: BraveSearchClient;

  constructor(options: SerperServiceOptions) {
    this.client = new SerperClient(options);
    this.braveClient = options.braveClient;
  }

  async searchAndNormalize(query: string) {
    const res = await this.client.searchShopping(query);
    const shopping = res?.shopping ?? [];
    return normalizeSerperShopping(shopping, this.braveClient);
  }
}

export default SerperService;
