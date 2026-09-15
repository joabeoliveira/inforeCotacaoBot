import http from 'node:http';
import { createSerperServiceInstance } from '../bootstrap/clients.js';
import SerperService from '../serper/service.js';

export interface CreateServerOpts {
  serperService?: SerperService;
  /**
   * Chave exigida no header `x-api-key` (ou `Authorization: Bearer <chave>`).
   * Quando ausente, o endpoint fica aberto (comportamento anterior) — [A CONFIRMAR]
   * com o negócio qual modelo de autenticação será adotado.
   */
  apiKey?: string;
  /** Tamanho máximo do corpo da requisição em bytes (padrão: 16 KiB). */
  maxBodyBytes?: number;
  /** Timeout de processamento por requisição em ms (padrão: 15 s). */
  requestTimeoutMs?: number;
}

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Extrai a chave enviada pelo cliente, aceitando `x-api-key` ou `Authorization: Bearer`. */
function extractApiKey(req: http.IncomingMessage): string | undefined {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers['authorization'];
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  return undefined;
}

function sendJSON(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

/**
 * Registra o motivo da falha de upstream no log do container (para diagnóstico),
 * removendo qualquer sequência longa que possa ser uma API key.
 * O corpo devolvido ao cliente continua genérico.
 */
export function logUpstreamError(err: unknown) {
  const name = err instanceof Error ? err.name : 'Error';
  const status = (err as { status?: number } | undefined)?.status;
  const rawMessage = err instanceof Error ? err.message : 'unknown error';
  const safeMessage = rawMessage.replace(/[A-Za-z0-9_\-]{20,}/g, '[REDACTED]');
  console.error(`[api] upstream error: ${name}${status ? ` status=${status}` : ''} - ${safeMessage}`);
}

export function createServer(opts: CreateServerOpts = {}) {
  const serperService = opts.serperService ?? createSerperServiceInstance();
  const apiKey = (opts.apiKey ?? process.env.INFORE_QUOTES_API_KEY ?? '').trim();
  const maxBodyBytes = positiveNumber(
    opts.maxBodyBytes ?? process.env.INFORE_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES,
  );
  const requestTimeoutMs = positiveNumber(
    opts.requestTimeoutMs ?? process.env.INFORE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  const server = http.createServer(async (req, res) => {
    try {
      // Health check (usado por orquestradores/Docker). Não chama APIs externas.
      if (req.url === '/health' || req.url === '/healthz') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          return res.end();
        }
        return sendJSON(res, 200, { status: 'ok' });
      }

      if (req.url === '/api/quotes/search' && req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        return res.end();
      }

      if (req.method !== 'POST' || req.url !== '/api/quotes/search') {
        res.writeHead(404);
        return res.end();
      }

      // Autenticação opcional: ativa quando a chave está configurada no ambiente.
      if (apiKey && extractApiKey(req) !== apiKey) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      // Limite de tamanho: interrompe a leitura ao exceder, evitando consumo de memória.
      let body = '';
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk as Buffer);
        if (size > maxBodyBytes) {
          return sendJSON(res, 413, { error: 'Payload too large' });
        }
        body += chunk;
      }

      let parsed;
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (err) {
        return sendJSON(res, 400, { error: 'Invalid JSON payload' });
      }

      const query = parsed?.query;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return sendJSON(res, 400, { error: 'Field "query" is required' });
      }

      // Timeout de processamento: evita segurar conexão indefinidamente.
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        if (!res.headersSent) sendJSON(res, 504, { error: 'Request timeout' });
      }, requestTimeoutMs);
      try {
        const offers = await serperService.searchAndNormalize(query.trim());
        if (timedOut) return;
        return sendJSON(res, 200, { offers, count: Array.isArray(offers) ? offers.length : 0 });
      } catch (err: any) {
        // Diagnóstico no log do servidor (sem expor segredos); resposta genérica ao cliente.
        logUpstreamError(err);
        if (timedOut) return;
        return sendJSON(res, 502, { error: 'Upstream search service failed' });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      // Unexpected
      if (!res.headersSent) return sendJSON(res, 500, { error: 'Internal server error' });
      return;
    }
  });

  return {
    server,
    listen(port = 0) {
      return new Promise<number>((resolve, reject) => {
        server.listen(port, () => {
          // @ts-ignore
          const address = server.address();
          const assigned = typeof address === 'object' && address ? address.port : port;
          resolve(assigned as number);
        });
        server.on('error', reject);
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // Encerra sockets keep-alive ociosos para que o shutdown não fique pendurado,
        // mantendo requisições em andamento até concluírem.
        server.closeIdleConnections();
      });
    },
  };
}

export default createServer;
