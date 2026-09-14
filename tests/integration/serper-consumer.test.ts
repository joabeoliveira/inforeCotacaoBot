import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import * as fs from 'node:fs';
import consumeSerperJsonFile from '../../src/serper/consumer.js';
import { BraveSearchClient } from '../../src/brave/client.js';
import { SerperService } from '../../src/serper/service.js';

test('integra SerperService com normalizador e Brave mockado', async () => {
  const file = path.resolve('temp/Playground-serper.md');
  const braveMock: any = { validateProductLink: async () => ({ valid: false, url: null, reason: 'no_match' }) };
  const service = new SerperService({ apiKey: 'k', fetchImpl: async () => {
    // return parsed Playground JSON to simulate Serper API
    const raw = await fs.promises.readFile(file, 'utf8');
    const match = raw.match(/```json([\s\S]*?)```/);
    const payload = match ? match[1].trim() : raw;
    return new Response(payload, { status: 200 });
  }, braveClient: braveMock });
  const offers = await service.searchAndNormalize('memoria');
  assert.ok(Array.isArray(offers));
  assert.ok(offers.length > 0);
});

test('SerperService não chama Brave para links HTTP/HTTPS normais', async () => {
  const file = path.resolve('temp/Playground-serper.md');
  // craft a minimal serper shopping payload with a normal http link
  const payload = JSON.stringify({ shopping: [ { title: 'Normal', link: 'https://example.com/p/normal', price: 'R$ 9,90' } ] });
  let called = false;
  const braveMock: any = { validateProductLink: async () => { called = true; return { valid: false, url: null, reason: 'should-not-call' }; } };
  const service = new SerperService({ apiKey: 'k', fetchImpl: async () => new Response(payload, { status: 200 }), braveClient: braveMock });
  const offers = await service.searchAndNormalize('q');
  assert.ok(Array.isArray(offers));
  assert.equal(called, false, 'Brave should not be called for normal HTTP links');
});

test('SerperService retorna array vazio quando resposta não tem campo shopping e não chama Brave', async () => {
  const payload = JSON.stringify({});
  let called = false;
  const braveMock: any = { validateProductLink: async () => { called = true; return { valid: false, url: null, reason: 'should-not-call' }; } };
  const service = new SerperService({ apiKey: 'k', fetchImpl: async () => new Response(payload, { status: 200 }), braveClient: braveMock });
  const offers = await service.searchAndNormalize('q');
  assert.ok(Array.isArray(offers), 'offers should be an array');
  assert.equal(offers.length, 0, 'offers should be empty when shopping missing');
  assert.equal(called, false, 'Brave should not be called');
});
