import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupplierDomain } from '../../src/normalizers/supplierDomains.js';
import { ValidationCache } from '../../src/brave/validationCache.js';
import normalizeSerperShopping from '../../src/normalizers/serperNormalizer.js';
import type { BraveSearchClient } from '../../src/brave/client.js';

const GOOGLE_LINK = 'https://www.google.com/search?ibp=oshop&q=caneta&prds=abc';

function fakeBrave(result?: { valid: boolean; url: string | null; reason: string }, onCall?: () => void) {
  const calls: Array<{ product: string; candidateUrl: string; supplierDomain?: string }> = [];
  const client = {
    validateProductLink: async (input: { product: string; candidateUrl: string; supplierDomain?: string }) => {
      calls.push(input);
      onCall?.();
      return result ?? { valid: true, url: 'https://www.kalunga.com.br/produto', matchedTitle: 'Caneta', reason: 'matched' };
    },
  } as unknown as BraveSearchClient;
  return { client, calls };
}

test('resolve domínio do fornecedor a partir do nome do vendedor', () => {
  assert.equal(resolveSupplierDomain('Magalu'), 'magazineluiza.com.br');
  assert.equal(resolveSupplierDomain('Kalunga'), 'kalunga.com.br');
  assert.equal(resolveSupplierDomain('Amazon.com.br - Retail'), 'amazon.com.br');
  assert.equal(resolveSupplierDomain('Mercado Livre'), 'mercadolivre.com.br');
  assert.equal(resolveSupplierDomain('Atacadão'), 'atacadao.com.br');
});

test('não inventa domínio para vendedor desconhecido nem casa falso positivo', () => {
  assert.equal(resolveSupplierDomain('Papelaria do Zé'), undefined);
  assert.equal(resolveSupplierDomain('Amazonas Distribuidora'), undefined);
  assert.equal(resolveSupplierDomain(''), undefined);
  assert.equal(resolveSupplierDomain(undefined), undefined);
});

test('valida via Brave usando o domínio do fornecedor e substitui o link', async () => {
  const { client, calls } = fakeBrave();
  const offers = await normalizeSerperShopping(
    [{ title: 'Caneta Bic', link: GOOGLE_LINK, source: 'Kalunga', price: 'R$ 1,05' }],
    client,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].supplierDomain, 'kalunga.com.br');
  assert.equal(offers[0].link_produto, 'https://www.kalunga.com.br/produto');
  assert.equal(offers[0].fonte, 'brave');
  assert.equal(offers[0].validation_reason, 'matched');
});

test('vendedor desconhecido não gasta consulta do Brave', async () => {
  const { client, calls } = fakeBrave();
  const offers = await normalizeSerperShopping(
    [{ title: 'Caneta Bic', link: GOOGLE_LINK, source: 'Papelaria do Zé' }],
    client,
  );
  assert.equal(calls.length, 0);
  assert.equal(offers[0].fonte, 'serper');
  assert.equal(offers[0].link_produto, GOOGLE_LINK);
  assert.equal(offers[0].validation_reason, 'supplier_domain_unknown');
});

test('respeita o limite de validações por cotação', async () => {
  const { client, calls } = fakeBrave();
  const items = Array.from({ length: 8 }, (_, i) => ({
    title: `Caneta ${i}`,
    link: GOOGLE_LINK,
    source: 'Kalunga',
  }));
  const offers = await normalizeSerperShopping(items, client, { maxBraveValidations: 3 });
  assert.equal(calls.length, 3, 'deve gastar no máximo 3 consultas do Brave');
  assert.equal(offers.filter((o) => o.validation_reason === 'validation_limit_reached').length, 5);
});

test('cache evita repetir a mesma validação entre cotações', async () => {
  let braveCalls = 0;
  const { client } = fakeBrave(undefined, () => {
    braveCalls += 1;
  });
  const cache = new ValidationCache({ ttlMs: 60_000 });
  const items = [{ title: 'Caneta Bic', link: GOOGLE_LINK, source: 'Kalunga' }];

  const first = await normalizeSerperShopping(items, client, { cache });
  const second = await normalizeSerperShopping(items, client, { cache });

  assert.equal(braveCalls, 1, 'a segunda cotação deve usar o cache');
  assert.equal(first[0].link_produto, second[0].link_produto);
  assert.equal(second[0].fonte, 'brave');
});

test('cache expira conforme o TTL', async () => {
  const cache = new ValidationCache({ ttlMs: 1 });
  cache.set('caneta', 'kalunga.com.br', { valid: true, url: 'https://kalunga.com.br/x', matchedTitle: null, reason: 'matched' });
  assert.ok(cache.get('caneta', 'kalunga.com.br'));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(cache.get('caneta', 'kalunga.com.br'), undefined);
});
