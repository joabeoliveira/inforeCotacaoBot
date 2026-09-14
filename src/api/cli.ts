import { createServer } from './server.js';

function fail(message: string): never {
  console.error(`[api] ${message}`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  fail('PORT inválida: use um inteiro entre 1 e 65535.');
}

if (!process.env.SERPER_API_KEY || !process.env.SERPER_API_KEY.trim()) {
  fail('SERPER_API_KEY ausente. Configure a variável de ambiente (não comite segredos).');
}

let app: ReturnType<typeof createServer>;
try {
  app = createServer();
} catch (error) {
  // Nunca imprimir o valor de chaves — apenas o motivo.
  fail(error instanceof Error ? error.message : 'falha ao inicializar o servidor');
}

const assignedPort = await app.listen(port);
console.log(`[api] ouvindo em 0.0.0.0:${assignedPort} (POST /api/quotes/search, GET /health)`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] recebido ${signal}, encerrando...`);
  try {
    await app.close();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
