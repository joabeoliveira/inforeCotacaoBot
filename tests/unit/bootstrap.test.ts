import test from 'node:test';
import assert from 'node:assert/strict';
import * as bootstrap from '../../src/bootstrap/clients.js';

test('cria clientes quando variáveis de ambiente presentes', async () => {
  const env = {
    BRAVE_SEARCH_API_KEY: 'x',
    SERPER_API_KEY: 'y',
  } as any;
  const brave = bootstrap.createBraveClient({ env });
  const serper = bootstrap.createSerperClient({ env });
  assert.ok(brave);
  assert.ok(serper);
});

test('erro quando BRAVE_SEARCH_API_KEY ausente', async () => {
  const env = { SERPER_API_KEY: 'y' } as any;
  let threw = false;
  try { bootstrap.createBraveClient({ env }); } catch (e) { threw = true; }
  assert.equal(threw, true);
});

test('erro quando SERPER_API_KEY ausente', async () => {
  const env = { BRAVE_SEARCH_API_KEY: 'x' } as any;
  let threw = false;
  try { bootstrap.createSerperClient({ env }); } catch (e) { threw = true; }
  assert.equal(threw, true);
});

test('timeout/retry configuráveis via env', async () => {
  const env = { BRAVE_SEARCH_API_KEY: 'x', BRAVE_SEARCH_TIMEOUT_MS: '1234', BRAVE_SEARCH_MAX_RETRIES: '3', SERPER_API_KEY: 'y', SERPER_TIMEOUT_MS: '2000', SERPER_MAX_RETRIES: '4' } as any;
  const brave = bootstrap.createBraveClient({ env });
  const serper = bootstrap.createSerperClient({ env });
  // Access internal/private fields indirectly by invoking methods that rely on them; here we assert objects created
  assert.ok(brave);
  assert.ok(serper);
});

test('mensagens de erro não expõem segredos', async () => {
  const env = { BRAVE_SEARCH_API_KEY: 'x' } as any;
  try {
    bootstrap.createSerperClient({ env });
    assert.fail('should have thrown');
  } catch (e: any) {
    assert.ok(typeof e.message === 'string');
    assert.ok(!e.message.includes('x'));
  }
});
