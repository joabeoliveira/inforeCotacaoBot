import assert from "node:assert/strict";
import test from "node:test";
import { BraveSearchClient } from "../../src/brave/client.js";

test("valida um link do fornecedor usando a resposta do Brave", async () => {
  const client = new BraveSearchClient({
    apiKey: "test-key",
    fetchImpl: async (input) => {
      assert.match(String(input), /site%3Aexample\.com/);
      return new Response(JSON.stringify({ web: { results: [{ title: "Produto", url: "https://example.com/produto" }] } }), { status: 200 });
    },
  });
  const result = await client.validateProductLink({ product: "Produto", candidateUrl: "https://example.com/resultado" });
  assert.deepEqual(result, { valid: true, url: "https://example.com/produto", matchedTitle: "Produto", reason: "matched" });
});

test("não gasta consulta para redirect inválido sem domínio do fornecedor", async () => {
  let called = false;
  const client = new BraveSearchClient({ apiKey: "test-key", fetchImpl: async () => { called = true; return new Response("{}"); } });
  const result = await client.validateProductLink({ product: "Produto", candidateUrl: "https://www.google.com/search?ibp=oshop&q=produto" });
  assert.equal(called, false);
  assert.equal(result.reason, "google_shopping_redirect");
});

test("normaliza domínios com www e ponto final e aceita subdomínios legítimos", async () => {
  const client = new BraveSearchClient({
    apiKey: "test-key",
    fetchImpl: async (input) => {
      // supplierDomain will be passed as "www.example.com." and must normalize to example.com
      assert.match(String(input), /site%3Aexample\.com/);
      return new Response(JSON.stringify({ web: { results: [{ title: "Produto", url: "https://sub.example.com/produto" }] } }), { status: 200 });
    },
  });
  const result = await client.validateProductLink({ product: "Produto", candidateUrl: "https://example.com/resultado", supplierDomain: "www.example.com." });
  assert.deepEqual(result, { valid: true, url: "https://sub.example.com/produto", matchedTitle: "Produto", reason: "matched" });
});

test("rejeita URLs que não sejam HTTP/HTTPS", async () => {
  const client = new BraveSearchClient({ apiKey: "test-key", fetchImpl: async () => new Response("{}") });
  const result = await client.validateProductLink({ product: "Produto", candidateUrl: "mailto:user@example.com" });
  assert.equal(result.reason, "invalid_input");
});

test("evita falsos positivos como example.com.evil.test", async () => {
  const client = new BraveSearchClient({
    apiKey: "test-key",
    fetchImpl: async (input) => {
      // search requested for example.com
      assert.match(String(input), /site%3Aexample\.com/);
      return new Response(JSON.stringify({ web: { results: [{ title: "Malware", url: "https://example.com.evil.test/prod" }] } }), { status: 200 });
    },
  });
  const result = await client.validateProductLink({ product: "Produto", candidateUrl: "https://example.com/resultado", supplierDomain: "example.com" });
  assert.equal(result.reason, "no_match");
});

test("retry após HTTP 503 em search", async () => {
  let calls = 0;
  const responses = [
    new Response("", { status: 503 }),
    new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }),
  ];
  const client = new BraveSearchClient({ apiKey: "test-key", fetchImpl: async () => { calls += 1; return responses.shift() as Response; }, maxRetries: 2 });
  const res = await client.search("teste");
  assert.equal(calls, 2);
  assert.ok(res.web);
});
