import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../../src/api/server.js';

const QUOTES_PATH = '/api/quotes/search';

async function post(port: number, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port}${QUOTES_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /api/quotes/search retorna offers válidas', async () => {
  const mockOffers = [{ produto: 'X', preco: 10 }];
  const svc = { searchAndNormalize: async (q: string) => { return mockOffers; } } as any;
  const app = createServer({ serperService: svc });
  const port = await app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'teste' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.offers, mockOffers);
    assert.equal(body.count, 1);
  } finally {
    await app.close();
  }
});

test('POST /api/quotes/search valida payload ausente', async () => {
  const svc = { searchAndNormalize: async () => [] } as any;
  const app = createServer({ serperService: svc });
  const port = await app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    await app.close();
  }
});

test('POST /api/quotes/search converte erro upstream em 502 sem expor segredos', async () => {
  const svc = { searchAndNormalize: async () => { throw new Error('upstream failure: token=SECRET'); } } as any;
  const app = createServer({ serperService: svc });
  const port = await app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'foo' }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'Upstream search service failed');
    // ensure no secret leaked
    assert.ok(!JSON.stringify(body).includes('SECRET'));
  } finally {
    await app.close();
  }
});

test('log de diagnostico registra o motivo sem vazar a chave', async () => {
  const fakeKey = 'BSAfjvxQTblCs4Up0AD55EQhtKuCNEU';
  const svc = {
    searchAndNormalize: async () => {
      const err: any = new Error(`Serper request failed with HTTP 401 (key=${fakeKey})`);
      err.name = 'SerperError';
      err.status = 401;
      throw err;
    },
  } as any;
  const app = createServer({ serperService: svc });
  const port = await app.listen(0);
  const captured: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'foo' }),
    });
    assert.equal(res.status, 502);
    // Consome o corpo para liberar o socket (evita keep-alive pendurado no teste)
    const body = await res.json();
    assert.equal(body.error, 'Upstream search service failed');
  } finally {
    console.error = originalError;
    await app.close();
  }
  const log = captured.join('\n');
  assert.ok(log.includes('SerperError'), 'log deve conter o tipo do erro');
  assert.ok(log.includes('status=401'), 'log deve conter o status HTTP do upstream');
  assert.ok(!log.includes(fakeKey), 'log NÃO pode conter a chave de API');
  assert.ok(log.includes('[REDACTED]'), 'valores longos devem ser redigidos');
});

test('rejeita corpo acima do limite com 413', async () => {
  const svc = { searchAndNormalize: async () => [] } as any;
  const app = createServer({ serperService: svc, maxBodyBytes: 64 });
  const port = await app.listen(0);
  try {
    const res = await post(port, { query: 'x'.repeat(500) });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error, 'Payload too large');
  } finally {
    await app.close();
  }
});

test('exige API key quando configurada (401 sem header, 200 com)', async () => {
  const svc = { searchAndNormalize: async () => [{ produto: 'X' }] } as any;
  const app = createServer({ serperService: svc, apiKey: 'chave-de-teste' });
  const port = await app.listen(0);
  try {
    const semHeader = await post(port, { query: 'teste' });
    assert.equal(semHeader.status, 401);
    await semHeader.json();

    const errada = await post(port, { query: 'teste' }, { 'x-api-key': 'errada' });
    assert.equal(errada.status, 401);
    await errada.json();

    const correta = await post(port, { query: 'teste' }, { 'x-api-key': 'chave-de-teste' });
    assert.equal(correta.status, 200);
    await correta.json();

    // Também aceita Authorization: Bearer
    const bearer = await post(port, { query: 'teste' }, { Authorization: 'Bearer chave-de-teste' });
    assert.equal(bearer.status, 200);
    await bearer.json();
  } finally {
    await app.close();
  }
});

test('/health não exige API key', async () => {
  const svc = { searchAndNormalize: async () => [] } as any;
  const app = createServer({ serperService: svc, apiKey: 'chave-de-teste' });
  const port = await app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    await res.json();
  } finally {
    await app.close();
  }
});

test('responde 504 quando o processamento excede o timeout', async () => {
  const svc = {
    searchAndNormalize: () => new Promise((resolve) => setTimeout(() => resolve([]), 400)),
  } as any;
  const app = createServer({ serperService: svc, requestTimeoutMs: 50 });
  const port = await app.listen(0);
  try {
    const res = await post(port, { query: 'teste' });
    assert.equal(res.status, 504);
    assert.equal((await res.json()).error, 'Request timeout');
  } finally {
    await app.close();
  }
});
