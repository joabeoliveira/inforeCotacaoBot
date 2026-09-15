# Deploy da API de cotações na VPS com Easypanel (via GitHub)

> Objetivo: publicar o wrapper HTTP (`POST /api/quotes/search`) numa VPS gerenciada pelo **Easypanel**, com build a partir do repositório GitHub.
>
> ⚠️ O endpoint hoje **não tem autenticação**. Antes de expor publicamente, leia a seção "Segurança" abaixo.

---

## 1. O que o deploy usa

| Item | Valor |
| :--- | :--- |
| Build | `Dockerfile` na raiz do repositório (multi-stage) |
| Entry point | `node dist/api/cli.js` |
| Porta interna | `3000` (`PORT`) |
| Health check | `GET /health` → `{"status":"ok"}` |
| Rotas | `POST /api/quotes/search`, `GET /health` |
| Segredos | Somente variáveis de ambiente do Easypanel (nunca no Git) |

O `Dockerfile` não copia `.env`, `tests/`, `workflows/` nem `docs/` (ver `.dockerignore`).

---

## 2. Pré-requisitos

1. Repositório no GitHub com o código deste projeto (o Easypanel fará o clone).
2. Servidor com Easypanel instalado e um domínio/subdomínio disponível.
3. Chaves de API válidas: `SERPER_API_KEY` (obrigatória) e `BRAVE_SEARCH_API_KEY` (opcional).

---

## 3. Passo a passo no Easypanel

1. **Create Project** → por exemplo `infore-cotacoes`.
2. Dentro do projeto, **Create Service → App**.
3. **Source**: selecione o provedor GitHub, autorize e escolha o repositório e a branch (`main`/`master`).
4. **Build**: escolha **Dockerfile** como método de build (não use Nixpacks, para evitar divergência de runtime).
   - Caminho do Dockerfile: `Dockerfile` (raiz).
5. **Environment** (variáveis — apenas aqui, nunca no repositório):
   ```env
   PORT=3000
   SERPER_API_KEY=<sua-chave>
   SERPER_API_URL=https://google.serper.dev/search
   SERPER_TIMEOUT_MS=5000
   SERPER_MAX_RETRIES=2
   SERPER_GL=br
   SERPER_HL=pt-br
   SERPER_LOCATION=
   BRAVE_SEARCH_API_KEY=<sua-chave-opcional>
   BRAVE_SEARCH_API_URL=https://api.search.brave.com/res/v1/web/search
   BRAVE_SEARCH_TIMEOUT_MS=5000
   BRAVE_SEARCH_MAX_RETRIES=2
   ```
6. **Deploy** (o Easypanel faz build da imagem, aplica as envs e sobe o container).
7. Após o deploy, valide pelo domínio público da App:
   ```bash
   curl -i https://SEU-ENDERECO-DA-API/health
   ```
   Esperado: `HTTP/1.1 200` com `{"status":"ok"}`.
8. **Deploy automático**: o Easypanel pode re-deployar a cada push no GitHub (verifique a opção de auto-deploy da App).

---

## 4. Apontar o workflow do n8n para a API publicada

O workflow `workflows/teste-infore-serper-brave.json` e sua cópia no n8n usam o placeholder:

```
https://SEU-ENDERECO-DA-API/api/quotes/search
```

Depois do deploy, substitua **somente esse trecho** pelo domínio real da App no Easypanel. Mantenha o sufixo `/api/quotes/search`.

Pontos de atenção:

- A URL do painel (`https://n8n.infore.cloud/`) **não** é a URL desta API — são serviços distintos.
- Se a API rodar apenas na sua máquina Windows (`localhost`), o n8n remoto **não** consegue acessá-la. Nesse caso é necessário expor via túnel (ex.: Cloudflare Tunnel/ngrok) ou publicar na VPS.
- O `Workflow` deve permanecer **inativo** até a substituição da URL e a revisão de segurança.

---

## 5. Desenvolvimento local (comparação)

```bash
npm install
npm run dev:api        # sobe a API com reload (tsx)
npm test               # testes (fetch mockado, sem chamadas reais)
npm run typecheck      # verificação de tipos
npm run build && npm start   # simula o comportamento do container
```

---

## 6. Segurança

🔴 **Pendência crítica — [A CONFIRMAR]**: o endpoint `POST /api/quotes/search` está **aberto, sem autenticação e sem rate limit**. Publicado na internet, qualquer pessoa pode consumir as quotas pagas de Serper/Brave.

Opções (decisão de negócio):

| Opção | Esforço | Observação |
| :--- | :--- | :--- |
| Header `x-api-key`/`Authorization: Bearer` validado pela API | Baixo | Chave única compartilhada com o n8n — [A CONFIRMAR] |
| API key por cliente + rate limit por chave | Médio | Requer gestão de chaves — [A CONFIRMAR] |
| Restringir por IP/rede (Easypanel/Cloudflare) ao IP do n8n | Baixo | Não cobre n8n com IP dinâmico — [A CONFIRMAR] |
| Basic Auth do proxy (Easypanel/Cloudflare Access) | Baixo | Camada extra, sem alterar o código |

Recomendações adicionais:

- Limite de tamanho do body e timeout de requisição no servidor (hoje **não existem**).
- Cache de curta duração para queries repetidas, reduzindo custo de API.
- Nunca registrar corpo de requisição nem valores de chaves nos logs.

---

## 7. Troubleshooting

| Sintoma | Provável causa |
| :--- | :--- |
| Container sobe e cai | `SERPER_API_KEY` ausente/inválida — o processo encerra com `exit 1` e log explícito (sem imprimir a chave) |
| `502` no n8n | Falha no Serper/Brave (chave inválida, quota, timeout) — ver logs da App no Easypanel |
| `400` no n8n | Body sem `query` ou JSON malformado |
| Timeout no n8n | URL apontando para `localhost` ou domínio incorreto |
| Healthcheck falhando | `PORT` alterada sem ajustar a porta da App no Easypanel |
