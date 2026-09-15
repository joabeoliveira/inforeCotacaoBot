import assert from 'node:assert/strict';
import test from 'node:test';
import { SerperClient } from '../../src/serper/client.js';

test('erro quando API key ausente', async () => {
  try {
    // @ts-ignore
    new SerperClient({ apiKey: '' });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof Error);
  }
});

test('requisicao serper bem sucedida', async () => {
  let called = false;
  const mockFetch = async () => {
    called = true;
    return new Response(JSON.stringify({ shopping: [] }), { status: 200 });
  };
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any });
  const res = await client.searchShopping('q');
  assert.ok(called);
  assert.ok(res.shopping);
});

test('retry em 429 e 503', async () => {
  const responses = [new Response('', { status: 429 }), new Response('', { status: 503 }), new Response(JSON.stringify({ shopping: [] }), { status: 200 })];
  const mockFetch = async () => responses.shift();
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, maxRetries: 3 });
  const res = await client.searchShopping('q');
  assert.ok(res.shopping);
});

test('http 401 levanta SerperError', async () => {
  const mockFetch = async () => new Response('', { status: 401 });
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, maxRetries: 0 });
  try {
    await client.searchShopping('q');
    assert.fail('should throw');
  } catch (e: any) {
    assert.equal(e.status, 401);
  }
});

test('http 403 levanta SerperError', async () => {
  const mockFetch = async () => new Response('', { status: 403 });
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, maxRetries: 0 });
  try {
    await client.searchShopping('q');
    assert.fail('should throw');
  } catch (e: any) {
    assert.equal(e.status, 403);
  }
});

test('resposta JSON inválida levanta SerperError', async () => {
  const mockFetch = async () => new Response('not-json', { status: 200 });
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, maxRetries: 0 });
  try {
    await client.searchShopping('q');
    assert.fail('should throw');
  } catch (e: any) {
    // Expect a SerperError wrapping the JSON parse failure
    assert.ok(e instanceof Error);
    assert.match(String(e.message), /Serper request failed/);
  }
});

test('timeout dispara erro', async () => {
  // Simula o fetch real: a promise só termina quando o sinal é abortado pelo timeout do cliente.
  // (Um mock que nunca resolve e ignora o AbortSignal trava o teste para sempre.)
  const mockFetch = (_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, timeoutMs: 10, maxRetries: 0 });
  await assert.rejects(
    () => client.searchShopping('q'),
    (e: any) => e instanceof Error && /Serper request failed/.test(String(e.message)),
  );
});

test('usa o endpoint oficial do Serper por padrão (google.serper.dev)', async () => {
  let calledUrl = '';
  const mockFetch = async (url: unknown) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ shopping: [] }), { status: 200 });
  };
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any });
  await client.searchShopping('q');
  // Regressão: api.serper.dev responde HTTP 404 e quebrava a integração end-to-end
  assert.equal(calledUrl, 'https://google.serper.dev/search');
});

test('resposta sem campo shopping não quebra e retorna objeto vazio', async () => {
  const mockFetch = async () => new Response(JSON.stringify({}), { status: 200 });
  const client = new SerperClient({ apiKey: 'k', fetchImpl: mockFetch as any, maxRetries: 0 });
  const res = await client.searchShopping('q');
  // Should not throw; observed behavior: returns parsed object without `shopping` field
  assert.equal(typeof res, 'object');
  assert.equal(res.shopping, undefined);
});
