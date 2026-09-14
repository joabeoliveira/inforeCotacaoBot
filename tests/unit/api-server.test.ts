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
