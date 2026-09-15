/**
 * Mapa "vendedor" (campo `source` devolvido pelo Serper Shopping) → domínio do site.
 *
 * Usado exclusivamente para a validação de link via Brave (`site:<dominio>`), que é
 * o que corrige os links inválidos do Google Shopping.
 *
 * [A CONFIRMAR] com o time Infore: são os sites públicos conhecidos desses varejistas,
 * mas a lista oficial de fornecedores deve ser validada pelo negócio.
 * Vendedor fora deste mapa → não valida (preserva o link original, sem gastar Brave).
 */
export const SUPPLIER_DOMAINS: Record<string, string> = {
  // Marketplaces
  'mercado livre': 'mercadolivre.com.br',
  mercadolivre: 'mercadolivre.com.br',
  'mercadolivro': 'mercadolivre.com.br',
  amazon: 'amazon.com.br',
  'amazon.com.br': 'amazon.com.br',
  shopee: 'shopee.com.br',
  magalu: 'magazineluiza.com.br',
  magazineluiza: 'magazineluiza.com.br',
  'casas bahia': 'casasbahia.com.br',
  casasbahia: 'casasbahia.com.br',

  // Varejo / papelaria / informática
  kalunga: 'kalunga.com.br',
  gimba: 'gimba.com.br',
  'gimba.com': 'gimba.com.br',
  dell: 'dell.com',
  frigelar: 'frigelar.com.br',

  // Alimentar
  assai: 'assai.com.br',
  atacadao: 'atacadao.com.br',
  carrefour: 'carrefour.com.br',
};

/** Normaliza o nome do vendedor: minúsculas, sem acentos, sem sufixos comuns. */
function normalizeVendor(vendor: string): string {
  return vendor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s*[-–|]\s*(retail|store|oficial|brasil|br)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve o domínio do fornecedor a partir do nome do vendedor.
 * Faz match exato e, como fallback, match respeitando limites de token
 * (evita falsos positivos como "Amazonas" casando com "amazon").
 */
export function resolveSupplierDomain(vendor?: string | null): string | undefined {
  if (!vendor) return undefined;
  const key = normalizeVendor(vendor);
  if (!key) return undefined;

  const exact = SUPPLIER_DOMAINS[key];
  if (exact) return exact;

  for (const [alias, domain] of Object.entries(SUPPLIER_DOMAINS)) {
    const pattern = new RegExp(`(^|[^a-z0-9.])${escapeRegExp(alias)}([^a-z0-9]|$)`);
    if (pattern.test(key)) return domain;
  }
  return undefined;
}

export default resolveSupplierDomain;
