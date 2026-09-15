import { BraveSearchClient, BraveSearchError } from "../brave/client.js";
import { ValidationCache } from "../brave/validationCache.js";
import { resolveSupplierDomain } from "./supplierDomains.js";

export interface NormalizeOptions {
  /**
   * Máximo de itens validados via Brave por execução (padrão: 5).
   * Protege o orçamento do Brave — o Serper pode devolver dezenas de itens.
   */
  maxBraveValidations?: number;
  /** Cache de validações, para não repetir a mesma consulta entre cotações. */
  cache?: ValidationCache;
}

export interface SerperShoppingItem {
  title: string;
  source?: string;
  link: string;
  price?: string;
  imageUrl?: string;
  rating?: number;
  ratingCount?: number;
  productId?: string;
  position?: number;
}

export interface OfertaUnificada {
  produto: string;
  preco: number | null;
  preco_original: number | null;
  comissao_percentual: number | null;
  frete_estimado: number | null;
  custo_total: number | null;
  vendedor: string | null;
  fornecedor: string | null;
  tipo_fornecedor: string | null;
  link_produto: string | null;
  link_afiliado: string | null;
  disponibilidade: string | null;
  cep_destino: string | null;
  timestamp_coleta: string | null;
  fonte: string | null;
  validation_reason?: string | null;
}

function parsePriceBR(text?: string): number | null {
  if (!text) return null;
  // Remove currency symbols and non digit/.,\, characters
  const cleaned = String(text).replace(/[^0-9.,]/g, '').trim();
  if (!cleaned) return null;
  // If contains comma as decimal separator (BR format)
  const thousandsRemoved = cleaned.replace(/\.(?=\d{3}(?:[.,]|$))/g, '');
  const normalized = thousandsRemoved.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function isGoogleShoppingRedirect(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    const hasIbp = Boolean(u.searchParams.get('ibp')?.includes('oshop'));
    return Boolean((host === 'google.com' || host === 'www.google.com' || host.endsWith('.google.com'))
      && u.pathname === '/search' && u.searchParams.has('ibp') && hasIbp);
  } catch {
    return false;
  }
}

export async function normalizeSerperShopping(
  items: SerperShoppingItem[],
  braveClient?: BraveSearchClient,
  options: NormalizeOptions = {},
): Promise<OfertaUnificada[]> {
  const maxBraveValidations = options.maxBraveValidations ?? 5;
  const cache = options.cache;
  const results: OfertaUnificada[] = [];
  let validationsUsed = 0;

  for (const item of items) {
    const produto = item.title ?? '';
    const preco = parsePriceBR(item.price) ?? null;
    const preco_original = null;
    const comissao_percentual = null;
    const frete_estimado = null;
    let custo_total: number | null = null;

    // Compute custo_total conservatively: if preco present, start with preco
    if (preco !== null) custo_total = preco;

    let link_produto = item.link ?? null;
    let fonte = 'serper';
    let validation_reason: string | null = null;

    if (isGoogleShoppingRedirect(String(item.link)) && braveClient) {
      const supplierDomain = resolveSupplierDomain(item.source);
      if (!supplierDomain) {
        // Sem domínio confiável não há como validar com `site:` — preserva o link original.
        validation_reason = 'supplier_domain_unknown';
      } else if (validationsUsed >= maxBraveValidations) {
        validation_reason = 'validation_limit_reached';
      } else {
        const cached = cache?.get(produto, supplierDomain);
        if (cached) {
          validation_reason = cached.reason ?? null;
          if (cached.valid && cached.url) {
            link_produto = cached.url;
            fonte = 'brave';
          }
        } else {
          validationsUsed += 1;
          try {
            const validated = await braveClient.validateProductLink({
              product: produto,
              candidateUrl: String(item.link),
              supplierDomain,
            });
            cache?.set(produto, supplierDomain, validated);
            validation_reason = validated.reason ?? null;
            if (validated.valid && validated.url) {
              link_produto = validated.url;
              fonte = 'brave';
            } else {
              // preserve original link and mark reason
              fonte = 'serper';
            }
          } catch (err) {
            if (err instanceof BraveSearchError) {
              validation_reason = err.message;
            } else {
              validation_reason = 'validate_error';
            }
            fonte = 'serper';
          }
        }
      }
    }

    // If commission or frete were provided in future, compute custo_total; current schema treats them as null
    // custo_total already set to preco if present; otherwise null

    const oferta: OfertaUnificada = {
      produto,
      preco,
      preco_original,
      comissao_percentual,
      frete_estimado,
      custo_total,
      vendedor: item.source ?? null,
      fornecedor: null,
      tipo_fornecedor: null,
      link_produto,
      link_afiliado: null,
      disponibilidade: null,
      cep_destino: null,
      timestamp_coleta: null,
      fonte,
      validation_reason,
    };
    results.push(oferta);
  }
  return results;
}

export default normalizeSerperShopping;
