import type {
  BraveSearchOptions,
  BraveSearchResponse,
  LinkValidationInput,
  ValidatedLink,
} from "./types.js";

const DEFAULT_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const GOOGLE_HOSTS = new Set(["google.com", "www.google.com", "google.com.br", "www.google.com.br"]);

export class BraveSearchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "BraveSearchError";
  }
}

export class BraveSearchClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: BraveSearchOptions) {
    if (!options.apiKey.trim()) throw new Error("BRAVE_SEARCH_API_KEY is required");
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: string): Promise<BraveSearchResponse> {
    if (!query.trim()) throw new BraveSearchError("Search query cannot be empty");
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("country", "BR");
    url.searchParams.set("search_lang", "pt-br");
    url.searchParams.set("count", "10");

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          headers: { Accept: "application/json", "X-Subscription-Token": this.options.apiKey },
          signal: controller.signal,
        });
        if (response.ok) return (await response.json()) as BraveSearchResponse;
        // Retry on transient server errors (including 503). Otherwise fail fast.
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === this.maxRetries) {
          throw new BraveSearchError(`Brave Search failed with HTTP ${response.status}`, response.status);
        }
      } catch (error) {
        if (attempt === this.maxRetries) {
          if (error instanceof BraveSearchError) throw error;
          throw new BraveSearchError(`Brave Search request failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
    throw new BraveSearchError("Brave Search request exhausted retries");
  }

  async validateProductLink(input: LinkValidationInput): Promise<ValidatedLink> {
    if (!input.product.trim() || !input.candidateUrl.trim()) {
      return { valid: false, url: null, matchedTitle: null, reason: "invalid_input" };
    }
    let candidate: URL;
    try {
      candidate = new URL(input.candidateUrl);
    } catch {
      return { valid: false, url: null, matchedTitle: null, reason: "invalid_input" };
    }
    // Only accept http(s) candidate URLs
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return { valid: false, url: null, matchedTitle: null, reason: "invalid_input" };
    }

    const normalizedCandidateHost = candidate.hostname.toLowerCase().replace(/\.+$/, "");
    const isGoogleRedirect = GOOGLE_HOSTS.has(normalizedCandidateHost) && candidate.pathname === "/search" && candidate.searchParams.has("ibp");
    if (isGoogleRedirect && !input.supplierDomain) {
      return { valid: false, url: null, matchedTitle: null, reason: "google_shopping_redirect" };
    }
    // Normalize supplier domain for comparison: remove leading www. and trailing dots
    const normalizeDomainForComparison = (d: string) => {
      let s = d.trim().toLowerCase();
      if (s.endsWith('.')) s = s.slice(0, -1);
      if (s.startsWith('www.')) s = s.slice(4);
      return s;
    };

    const normalizeHostname = (h: string) => h.trim().toLowerCase().replace(/\.+$/, '');

    const domain = normalizeDomainForComparison(input.supplierDomain ?? normalizedCandidateHost);
    const response = await this.search(`"${input.product}" site:${domain}`);
    const result = response.web?.results?.find((item) => {
      if (!item.url) return false;
      try {
        const host = normalizeHostname(new URL(item.url).hostname);
        // Match exact domain or legitimate subdomain (sub.example.com), but avoid suffix matches that cross label boundaries
        return host === domain || host.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    });
    return result?.url
      ? { valid: true, url: result.url, matchedTitle: result.title ?? null, reason: "matched" }
      : { valid: false, url: null, matchedTitle: null, reason: "no_match" };
  }
}
