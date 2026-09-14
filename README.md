# Infore Cotação Bot — Integração rápida com n8n / MVP

Esta seção explica a configuração mínima para executar localmente e integrar com um orquestrador como o n8n.

**1) Configurar variáveis de ambiente**

Você pode configurar as variáveis via arquivo local `.env` (não commitar) ou via secrets do ambiente/CI.

Exemplo (arquivo local `.env`, **NÃO** comitar):

```env
BRAVE_SEARCH_API_KEY=
BRAVE_SEARCH_API_URL=
BRAVE_SEARCH_TIMEOUT_MS=
BRAVE_SEARCH_MAX_RETRIES=

SERPER_API_KEY=
SERPER_API_URL=
SERPER_TIMEOUT_MS=
SERPER_MAX_RETRIES=
```

Veja também `.env.example` no repositório — contém apenas placeholders e serve de guia.

**2) Observações de segurança**

- Nunca comite chaves ou arquivos `.env` com segredos.
- Use um secret manager em produção (e.g., Azure Key Vault, AWS Secrets Manager) ou as variáveis de ambiente do runtime (n8n, container, etc.).

**3) Exemplo mínimo de uso (bootstrap/manual)**

O projeto fornece utilitários para criar clientes; abaixo está um exemplo mínimo de como criar um `SerperService` usando variáveis de ambiente.

```js
import SerperService from './src/serper/service.js';
import { BraveSearchClient } from './src/brave/client.js';

const serperOpts = {
  apiKey: process.env.SERPER_API_KEY,
  endpoint: process.env.SERPER_API_URL,
  timeoutMs: process.env.SERPER_TIMEOUT_MS ? Number(process.env.SERPER_TIMEOUT_MS) : undefined,
  maxRetries: process.env.SERPER_MAX_RETRIES ? Number(process.env.SERPER_MAX_RETRIES) : undefined,
};

const braveClient = process.env.BRAVE_SEARCH_API_KEY ? new BraveSearchClient({
  apiKey: process.env.BRAVE_SEARCH_API_KEY,
  endpoint: process.env.BRAVE_SEARCH_API_URL,
  timeoutMs: process.env.BRAVE_SEARCH_TIMEOUT_MS ? Number(process.env.BRAVE_SEARCH_TIMEOUT_MS) : undefined,
  maxRetries: process.env.BRAVE_SEARCH_MAX_RETRIES ? Number(process.env.BRAVE_SEARCH_MAX_RETRIES) : undefined,
}) : undefined;

const service = new SerperService({ ...serperOpts, braveClient });

// Agora você pode usar `service.searchAndNormalize(query)` dentro de um node n8n (function/HTTP) ou worker.
```

**4) Comportamento importante**

- Os testes automatizados do repositório não fazem chamadas reais às APIs externas (os `fetch` são mockados).
- O `BraveSearchClient` é usado somente para validar redirects do Google Shopping (ex.: URLs com `google.com/search?ibp=oshop...`).
- `.env.example` contém apenas placeholders — preencha seus valores locais e mantenha o real `.env` fora do Git.

**5) Wrapper HTTP (para n8n) e deploy**

O projeto expõe uma API mínima (sem framework extra, usando o módulo `http` do Node):

- `POST /api/quotes/search` — body `{ "query": "string" }` → `{ "offers": [...], "count": number }`
- `GET /health` — health check (`{ "status": "ok" }`)

```bash
npm run dev:api               # desenvolvimento (reload)
npm run build && npm start    # produção (igual ao container)
```

Para publicar numa VPS com Easypanel a partir do GitHub, veja [docs/deploy-easypanel.md](docs/deploy-easypanel.md).

Se precisar, posso adicionar um exemplo de `n8n` workflow que chama um endpoint interno que usa `SerperService`.
