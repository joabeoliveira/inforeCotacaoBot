import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../../src/api/server.js';

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
