export interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

export interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export interface BraveSearchOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface LinkValidationInput {
  product: string;
  candidateUrl: string;
  /** Supplier domain is required when the candidate is a Google Shopping redirect. */
  supplierDomain?: string;
}

export interface ValidatedLink {
  valid: boolean;
  url: string | null;
  matchedTitle: string | null;
  reason: "matched" | "google_shopping_redirect" | "no_match" | "invalid_input";
}
