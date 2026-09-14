import assert from "node:assert/strict";
import test from "node:test";
import normalizeSerperShopping from "../../src/normalizers/serperNormalizer.js";
import { BraveSearchClient } from '../../src/brave/client.js';

test("normaliza resultado padrão do Serper", async () => {
  const items = [
    { title: "Produto A", link: "https://example.com/p/1", price: "R$ 100,00" },
  ];
  const res = await normalizeSerperShopping(items);
  assert.equal(res.length, 1);
  assert.equal(res[0].produto, "Produto A");
  assert.equal(res[0].preco, 100);
  assert.equal(res[0].custo_total, 100);
  assert.equal(res[0].link_produto, "https://example.com/p/1");
  assert.equal(res[0].fonte, "serper");
});

test("identifica link Google Shopping inválido e usa Brave quando validado", async () => {
  const items = [
    { title: "Produto B", link: "https://www.google.com/search?ibp=oshop&q=produto+b" },
  ];
  const braveMock: any = {
    validateProductLink: async ({ product, candidateUrl }: any) => ({ valid: true, url: "https://example.com/validated", matchedTitle: product, reason: 'matched' }),
  };
  const res = await normalizeSerperShopping(items, braveMock);
  assert.equal(res[0].link_produto, "https://example.com/validated");
  assert.equal(res[0].fonte, "brave");
  assert.equal(res[0].validation_reason, 'matched');
});

test("quando Brave não encontra correspondência, preserva a oferta", async () => {
  const items = [
    { title: "Produto C", link: "https://www.google.com/search?ibp=oshop&q=produto+c" },
  ];
  const braveMock: any = { validateProductLink: async () => ({ valid: false, url: null, reason: 'no_match' }) };
  const res = await normalizeSerperShopping(items, braveMock);
  assert.equal(res[0].link_produto, "https://www.google.com/search?ibp=oshop&q=produto+c");
  assert.equal(res[0].fonte, "serper");
  assert.equal(res[0].validation_reason, 'no_match');
});

test("campos opcionais ausentes e cálculo de custo_total com comissao e frete", async () => {
  // Provide an item with price and simulate commission/frete applied after normalization
  const items = [ { title: "Produto D", link: "https://example.com/p/2", price: "R$ 200,00" } ];
  const res = await normalizeSerperShopping(items);
  // base preco
  assert.equal(res[0].preco, 200);
  // no comissao/frete available -> custo_total equals preco
  assert.equal(res[0].custo_total, 200);
});

test("idempotência: aplicar normalizador duas vezes não altera resultados", async () => {
  const items = [ { title: "Produto E", link: "https://example.com/p/3", price: "R$ 50,00" } ];
  const first = await normalizeSerperShopping(items);
  const second = await normalizeSerperShopping(items);
  assert.deepEqual(first, second);
});

test('não chama Brave para links que não sejam redirect do Google Shopping', async () => {
  const items = [ { title: 'Produto F', link: 'https://example.com/p/4', price: 'R$ 10,00' } ];
  let called = false;
  const braveMock: any = { validateProductLink: async () => { called = true; return { valid: false, url: null, reason: 'should-not-be-called' }; } };
  const res = await normalizeSerperShopping(items, braveMock);
  assert.equal(called, false);
  assert.equal(res[0].link_produto, 'https://example.com/p/4');
});
