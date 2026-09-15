import http from 'node:http';
import { createSerperServiceInstance } from '../bootstrap/clients.js';
import SerperService from '../serper/service.js';

export interface CreateServerOpts {
  serperService?: SerperService;
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

      let body = '';
      for await (const chunk of req) {
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

      try {
        const offers = await serperService.searchAndNormalize(query.trim());
        return sendJSON(res, 200, { offers, count: Array.isArray(offers) ? offers.length : 0 });
      } catch (err: any) {
        // Diagnóstico no log do servidor (sem expor segredos); resposta genérica ao cliente.
        logUpstreamError(err);
        return sendJSON(res, 502, { error: 'Upstream search service failed' });
      }
    } catch (err) {
      // Unexpected
      return sendJSON(res, 500, { error: 'Internal server error' });
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
