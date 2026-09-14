# AGENTS.md — Contexto do Projeto Infore Cotações

> Este arquivo é lido automaticamente pelo Codex (CLI / VS Code) e por outros agentes (Cursor, Aider, Copilot Workspace). Mantenha-o atualizado a cada decisão arquitetural relevante.
>
> **Regra de ouro:** tudo que está marcado como `[A CONFIRMAR]` é hipótese. Não trate como fato. Pergunte antes de codar em cima.

---

## 1. Identidade do Projeto

Este repositório contém o sistema de automação de cotações (pesquisa de preços) da **Infore** (infore.com.br), um hub de suprimentos sediado no Rio de Janeiro.

**Modelo de negócio:**

- A Infore recebe pedidos de cotação de clientes (90% por email)
- Compra produtos de fornecedores/marketplaces a preços baixos
- Revende com comissão de **até 35%** sobre o preço + frete próprio
- **Objetivo central:** acelerar a cotação sem perder qualidade nem margem, liberando os vendedores para novas oportunidades

**Prioridade real (confirmada):**
> Otimizar as cotações tornando-as mais céleres, sem perder qualidade e margem de lucro. O foco é **reduzir o tempo de pesquisa do vendedor**, não necessariamente achar o preço absoluto mais baixo.

---

## 2. Problema Atual

O MVP já integra a API do **Serper.dev** (Google Shopping) e está em **piloto com 4 vendedores** (meta: 12).

Dores conhecidas:

- Links retornados pelo Serper Shopping frequentemente **não correspondem ao produto real** (apontam para `google.com/search?ibp=oshop...`)
- Isso gera **retrabalho manual** de validação de link
- Workflows n8n (Meli, Shopee, Amazon) complementam a busca, mas não cobrem os fornecedores de maior lucro (ex: Compras Paraguai)
- O **Hermes Agent** já compara preços e sugere decisões, mas **não tem acesso ao histórico** de fornecedor/material/lucro
- Volume atual: **100–200 cotações/dia**

---

## 3. Dados Reais da Infore (base para priorização)

Ranking por lucro total e volume (dados fornecidos pela Infore):

| Fornecedor | Materiais | Custo Total | Lucro | Margem % | Lucro/Material | Tipo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Mercado Livre | 402 | R$190.785 | R$83.966 | 44% | R$209 | Marketplace (afiliado) |
| **Estoque** | 246 | R$20.842 | R$8.743 | 42% | R$36 | **Estoque próprio** |
| Kalunga | 58 | R$12.855 | R$6.914 | 54% | R$119 | Varejo online |
| Amazon | 49 | R$28.229 | R$10.833 | 38% | R$221 | Marketplace (afiliado) |
| Cordex | 48 | R$19.996 | R$24.249 | **121%** | R$505 | B2B local |
| Shopee | 38 | R$30.794 | R$12.970 | 42% | R$341 | Marketplace (afiliado) |
| Hub Digital | 35 | R$18.964 | R$7.054 | 37% | R$202 | B2B local |
| Magalu | 30 | R$34.506 | R$12.765 | 37% | R$426 | Marketplace |
| **PY (Compras Paraguai)** | 25 | R$213.674 | R$98.647 | **46%** | **R$3.946** | **Importação** |
| Frigelar | 8 | R$147.787 | R$48.053 | 33% | **R$6.007** | B2B |
| Dell | 7 | R$144.148 | R$50.977 | 35% | **R$7.282** | Fabricante |
| May Paulo | 11 | R$11.523 | R$9.537 | 83% | R$867 | B2B local |
| Casas Bahia | 18 | R$57.538 | R$14.993 | 26% | R$833 | Varejo online |
| Assaí | 21 | R$9.071 | R$5.771 | 64% | R$275 | Varejo online |
| Atacadão | 18 | R$14.649 | R$6.531 | 45% | R$363 | Varejo online |
| Carrefour | 9 | R$8.311 | R$2.726 | 33% | R$303 | Varejo online |

**Insights que guiam a priorização:**

- **Compras Paraguai (PY)** é o maior lucro total e por material. Prioridade máxima.
- **Mercado Livre** é o maior volume. Prioridade máxima em paralelo.
- **Dell e Frigelar** têm lucro/material altíssimo com baixo volume. Bots dedicados valem a pena.
- **Cordex** tem margem de 121%. Vale investigar automação.
- **Estoque** é fonte interna — deve ser consultado **antes** de cotar externo.

---

## 4. Arquitetura Alvo (4 camadas)

### Camada 0 — Triagem (já existe)

- Emails de cotação chegam e são triados via n8n
- MVP atual chama Serper para cada item

### Camada 1 — Descoberta e Validação

- **Serper.dev** (Google Shopping): candidatos iniciais
- **Brave Search API**: validação do link real do produto (substitui links inválidos do Google Shopping)
- **Estoque interno (PostgreSQL)**: consultado antes de qualquer busca externa

### Camada 2 — Enriquecimento por Bots de Extração

- **Bots por fornecedor** (ver seção 7 para priorização)
- **Conversão para links de afiliado** (Meli, Shopee, Amazon — confirmados)

### Camada 3 — Decisão Inteligente

- **Hermes Agent** com acesso **read-only** ao PostgreSQL (histórico de fornecedor/material/lucro)
- Aplica regras: custo total (preço + comissão até 35% + frete) e margem mínima
- Gera link de afiliado da oferta vencedora

### Camada 4 — Revisão Humana

- Vendedor revisa, aprova, envia cotação ao cliente
- Cliente autoriza → compras

---

## 5. Stack Técnica (do MVP existente)

- **Frontend:** Next.js 16 + React 19 + TypeScript, Tailwind CSS
- **Backend:** Node.js 20 + Express 5 + TypeScript (tsx/ts-node em dev)
- **Banco / Cache / Fila:** PostgreSQL (`pg`), Redis (`ioredis`), BullMQ (workers)
- **Auth / Validação:** jsonwebtoken, bcryptjs, zod
- **Infra:** Docker (node:20-alpine)
- **Dev tooling:** concurrently, nodemon, tsx, ESLint, TypeScript
- **Orquestração:** n8n (latest) com agent autônomo + sandbox
- **MCP do n8n:** conectado ao VS Code (acesso direto aos workflows)
- **LLM de desenvolvimento:** Codex (OpenAI) via VS Code
- **LLMs auxiliares:** GitHub Copilot, DeepSeek
- **Agente de decisão:** Hermes Agent

**APIs externas:**

- Serper.dev (orçamento: **$50/mês**)
- Brave Search API (orçamento: **$10/mês** — usar com sabedoria)
- Mercado Livre API (afiliado)
- Shopee Affiliate API (afiliado)
- Amazon Product API (afiliado)
- Apify (Actors de scraping, se necessário)

> **Atenção ao orçamento:** Brave é o mais restrito. Priorizar Brave apenas para **validação de link** (não para descoberta). Serper tem folga suficiente (~50k queries/mês).

---

## 6. Estrutura do Repositório (proposta)

> **Nota:** o MVP atual vive em repositório separado. Este repositório (`inforeCotacaoBot`) é o de **evolução**. `vamos manter dois repositórios por enquanto.`

```
inforeCotacaoBot/
├── AGENTS.md                    # Este arquivo
├── README.md
├── .env.example
├── docker-compose.yml
│
├── apps/
│   ├── web/                     # Next.js 16 + React 19
│   ├── api/                     # Express 5 + Node 20
│   └── workers/                 # BullMQ workers (bots, validação, Hermes)
│
├── packages/
│   ├── shared/                  # Tipos, schema de oferta, utils
│   ├── serper/                  # Cliente Serper
│   ├── brave/                   # Cliente Brave
│   ├── hermes/                  # Cliente Hermes + prompts
│   ├── db/                      # Cliente PostgreSQL, migrations, read-only role
│   └── normalizer/              # Normalização de ofertas
│
├── bots/
│   ├── compras-paraguai/        # PY — prioridade 1
│   ├── mercado-livre/           # prioridade 1
│   ├── amazon/                  # prioridade 2
│   ├── shopee/                  # prioridade 2
│   ├── magalu/                  # prioridade 3
│   ├── kalunga/                 # prioridade 3
│   ├── casas-bahia/             # prioridade 3
│   ├── dell/                    # prioridade 3
│   ├── frigelar/                # prioridade 3
│   ├── cordex/                  # prioridade 4
│   ├── varejo-alimentar/        # Assaí, Atacadão, Carrefour
│   └── b2b-locais/              # Teia, Astro, Hub Digital, etc. (fase 2)
│
├── workflows/                   # n8n exports (orquestração)
├── schemas/
│   └── oferta-padrao.json
├── prompts/
│   └── hermes-system.md
├── docs/
│   ├── arquitetura.md
│   ├── regras-negocio.md
│   ├── apis.md
│   ├── fornecedores.md          # Como cada fornecedor é consultado
│   └── marketplaces.md
└── tests/
    ├── unit/
    └── integration/
```

---

## 7. Priorização de Bots (roadmap real)

| Prioridade | Bot | Justificativa | Tipo de acesso |
| :--- | :--- | :--- | :--- |
| 1 | **Compras Paraguai (PY)** | Maior lucro total e por material | Scraping do site + lojas |
| 1 | **Mercado Livre** | Maior volume (402) + afiliado | API oficial / Actor |
| 2 | **Amazon** | Volume + afiliado + lucro/material | API oficial / Actor |
| 2 | **Shopee** | Volume + afiliado + lucro/material | API oficial / Actor |
| 3 | **Magalu** | Volume + margem 37% | API/Actor VTEX |
| 3 | **Kalunga** | Volume 58 + margem 54% | Site próprio |
| 3 | **Casas Bahia** | Ticket alto | VTEX |
| 3 | **Dell** | Lucro/material R$7.282 | Site próprio |
| 3 | **Frigelar** | Lucro/material R$6.007 | Site próprio |
| 4 | **Cordex** | Margem 121% | B2B local — avaliar |
| 4 | **Varejo alimentar** | Assaí, Atacadão, Carrefour | Sites próprios |
| 5 | **B2B locais** | Teia, Astro, Hub Digital, etc. | Heterogêneo — fase 2 |

**Fornecedores B2B locais — estratégia por tipo de acesso:**

- **Têm site:** scraping ou API (priorizar)
- **Têm catálogo PDF:** extração + parsing (fase 2)
- **Têm sistema próprio:** integração caso a caso (fase 3, provavelmente manual assistido)
- **Só telefone/WhatsApp:** fora de escopo inicial

---

## 8. Schema Unificado de Oferta (`schemas/oferta-padrao.json`)

Todos os bots e integrações devem produzir ofertas neste formato. O Hermes depende disso.

```json
{
  "produto": "string (nome normalizado)",
  "preco": "number (BRL)",
  "preco_original": "number | null",
  "comissao_percentual": "number (0-35)",
  "frete_estimado": "number | null",
  "custo_total": "number (preco + comissao + frete)",
  "vendedor": "string",
  "fornecedor": "string (meli | amazon | shopee | py | kalunga | ...)",
  "tipo_fornecedor": "marketplace | varejo | b2b | importacao | estoque_interno",
  "link_produto": "string (URL validada)",
  "link_afiliado": "string | null",
  "disponibilidade": "in_stock | out_of_stock | unknown",
  "cep_destino": "string | null",
  "timestamp_coleta": "ISO 8601",
  "fonte": "serper | brave | bot_<fornecedor> | estoque_interno"
}
```

---

## 9. Fluxo Principal

```
1. Email chega → n8n triagem (já existe)
2. Para cada item:
   a. Consulta ESTOQUE INTERNO (PostgreSQL) primeiro
   b. Se não tem, dispara cotações externas em paralelo:
      - Serper Shopping → candidatos
      - Brave → validação de link (usar com parcimônia: $10/mês)
      - Bots por fornecedor prioritário
   c. Normaliza ofertas para schema unificado
   d. Hermes compara + consulta histórico (read-only no PostgreSQL)
   e. Gera link de afiliado quando aplicável (Meli, Shopee, Amazon)
3. Vendedor revisa, aprova, envia cotação ao cliente
4. Cliente autoriza → compras
```

---

## 10. Regras de Negócio (confirmadas)

- **Comissão:** até **35%** sobre o preço (variável, não fixa)
- **Frete:** frete próprio da Infore, somado ao custo total
- **Custo total** = preço do produto + comissão + frete
- **Prioridade de decisão:** menor custo total, mantendo margem
- **Afiliados:** Meli, Shopee, Amazon (confirmados)
- **Fornecedores novos:** fora de escopo inicial — otimizar apenas entre os existentes
- **Categorização de produto:** não é prioridade agora

---

## 11. Hermes Agent — Diretrizes

**O que o Hermes faz hoje:**

- Compara preços
- Verifica links inválidos
- Sugere tomada de decisões

**O que o Hermes deve ganhar (proposta):**

- Acesso **read-only** ao PostgreSQL com histórico de fornecedor/material/lucro
- Role dedicada no PostgreSQL (ex: `hermes_readonly`) — **sem permissão de escrita**
- Capacidade de priorizar fornecedores com base em margem histórica
- Aprender quais fornecedores rendem mais por categoria de produto

**Segurança:**

- Hermes **nunca** deve ter permissão de escrita no banco
- Toda query do Hermes deve ter timeout e limite de linhas
- Logs de todas as queries do Hermes para auditoria

---

## 12. Convenções de Código

- **Linguagem:** TypeScript (frontend e backend)
- **Commits:** português, Conventional Commits
  - Ex: `feat: bot compras paraguai`, `fix: normalizador shopee`, `docs: atualiza AGENTS.md`
- **Testes:** cada integração de API deve ter testes unitários com mocks
- **Segredos:** sempre em `.env` (nunca commitar)
- **Workflows n8n:** exportados em JSON na pasta `workflows/` ou `bots/<nome>/`
- **Retry e timeout:** obrigatórios em toda chamada de API externa
- **Normalizadores:** idempotentes, sem dependência de ordem
- **Schema unificado:** contrato imutável entre bots e Hermes

---

## 13. O Que o Codex Deve Fazer

- Seguir a arquitetura de 4 camadas descrita na seção 4
- Priorizar a **Camada 1 (validação de link via Brave)** como primeiro entregável
- Priorizar o **bot Compras Paraguai** como primeiro bot (maior lucro)
- Usar o **MCP do n8n** para ler/editar workflows diretamente quando a tarefa envolver n8n
- Manter o **schema unificado** como contrato entre todos os bots
- Sugerir testes antes de implementar integrações novas
- Respeitar o **orçamento de APIs** ($50 Serper + $10 Brave/mês)
- Marcar hipóteses como `[A CONFIRMAR]` quando faltar informação
- Atualizar este `AGENTS.md` quando a arquitetura evoluir
- Perguntar antes de assumir comportamento de API não documentada

---

## 14. O Que o Codex NÃO Deve Fazer

- Commitar segredos, chaves de API ou tokens
- Dar permissão de escrita ao Hermes no PostgreSQL
- Alterar regras de negócio sem confirmação
- Refatorar código não relacionado à tarefa atual
- Assumir comportamento de API sem documentação ou teste
- Criar bots que dependam de scraping frágil quando existir API oficial
- Ignorar o schema unificado ao criar novos normalizadores
- Propor fornecedores novos antes de otimizar os existentes
- Gastar queries do Brave com descoberta (usar só para validação)

---

## 15. Roadmap de Entregáveis

1. **Camada 1 — Validação de link via Brave** (resolve a dor principal)
2. **Schema unificado de oferta** + normalizador genérico
3. **Hermes com memória histórica** (role read-only no PostgreSQL)
4. **Bot Compras Paraguai** (maior lucro)
5. **Bot Mercado Livre** (maior volume + afiliado)
6. **Bot Amazon** (afiliado + lucro/material)
7. **Bot Shopee** (afiliado + lucro/material)
8. **Bot Magalu** (VTEX)
9. **Bot Kalunga**
10. **Bot Casas Bahia** (VTEX)
11. **Bot Dell**
12. **Bot Frigelar**
13. **Bot Cordex**
14. **Bots varejo alimentar** (Assaí, Atacadão, Carrefour)
15. **Bots B2B locais** (fase 2 — avaliar caso a caso)

---

## 16. Perguntas em Aberto `[A CONFIRMAR]`

- Repositório do MVP (`infore-cotacoes`) vs. este repo (`inforeCotacaoBot`): migrar ou manter dois? manter dois por enquanto.
- Fornecedores B2B locais: quais têm site, quais têm PDF, quais têm sistema próprio? ainda precisamos confirmar.
- Infore compra como CPF ou CNPJ nos marketplaces? ainda precisamos confirmar.
- Existe contrato formal de afiliado ou apenas cadastro? Cadastro já criado.
- O Hermes hoje é um agente separado (serviço) ou um prompt dentro do n8n? é um agente dentro do MVP atual.
- Existe dashboard atual para os vendedores ou é tudo via email/n8n? O sistema disponibiliza paineis de controle para os vendedores.

---

## 17. Referências Externas

- Serper.dev: https://serper.dev
- Brave Search API: https://brave.com/search/api/
- Compras Paraguai: https://www.comprasparaguai.com.br/
- n8n: https://n8n.io
- MCP do n8n: configurado no VS Code
- Hermes Agent: integrado ao MVP atual
- Apify Actors: https://apify.com/store

---

*Última atualização: [data] — atualize sempre que houver mudança arquitetural.*
```

---

### 📌 Notas Finais Sobre o Arquivo

1. **A seção 3 (dados reais) é o coração do arquivo.** Ela ancora o Codex na realidade da Infore, não em rankings genéricos. Toda priorização futura deve referenciar essa tabela.

2. **A seção 16 (perguntas em aberto)** é deliberadamente explícita. Isso evita que o Codex invente respostas. Quando você tiver as respostas, basta atualizar essa seção.

3. **A seção 7 (priorização de bots)** reflete os dados, não o ranking de mercado. Compras Paraguai vem antes de Magalu, mesmo sendo menor em volume.

4. **A seção 11 (Hermes)** já resolve o medo de "apagar algo importante" com a role read-only.

5. **A seção 14 (o que NÃO fazer)** é o guardrail mais importante. Especialmente "não dar permissão de escrita ao Hermes" e "não gastar Brave com descoberta".

---
