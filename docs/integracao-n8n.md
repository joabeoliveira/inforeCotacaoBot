# Integração n8n ⇄ SerperService

Documento curto descrevendo o contrato de integração entre um workflow n8n e o `SerperService` fornecido pelo código.

Resumo

- `SerperService.searchAndNormalize(query: string)` executa uma busca de shopping no Serper e normaliza os resultados usando o normalizador unificado do projeto. Aceita um `BraveSearchClient` opcional para validação de links Google Shopping.
- Erros de comunicação com Serper são propagados como `SerperError`. Erros dentro do fluxo de validação do Brave são isolados e transformados em campos de `validation_reason` nas ofertas, não falhando o fluxo principal.

1) Payload de entrada (exemplo enviado pelo n8n)

O n8n pode expor um node que aceita um único produto por execução (ou iterar uma lista). O formato mínimo sugerido:

```json
{
  "produto": "Furadeira X200 220V",
  "cep_destino": "20031-170" // opcional, usado mais adiante para cálculo de frete
}
```

Mapeamento para `SerperService`:

- Use `produto` → chamar `SerperService.searchAndNormalize(produto)`.
- `cep_destino` não é usado pelo `SerperService` automaticamente; se desejar, pos-processar ofertas retornadas para estimar frete.

2) Resposta normalizada (exemplo)

O `SerperService` retorna um array de ofertas no formato unificado (cada item obedece ao `schemas/oferta-padrao.json`). Exemplo parcial:

```json
[
  {
    "produto": "Furadeira X200 220V",
    "preco": 249.9,
    "preco_original": null,
    "comissao_percentual": null,
    "frete_estimado": null,
    "custo_total": 249.9,
    "vendedor": "Loja Exemplo",
    "fornecedor": null,
    "tipo_fornecedor": "marketplace",
    "link_produto": "https://example.com/p/furadeira-x200",
    "link_afiliado": null,
    "disponibilidade": "in_stock",
    "cep_destino": null,
    "timestamp_coleta": "2026-09-14T12:34:56Z",
    "fonte": "serper",
    "validation_reason": null
  }
]
```

3) Campos obrigatórios e opcionais

- Obrigatórios (conforme `schemas/oferta-padrao.json`): `produto`, `preco`, `custo_total`, `link_produto`, `fonte`.
  - Observação: o schema permite `null` em alguns desses campos (`preco`, `custo_total`, `link_produto`, `fonte`) — o normalizador atual procura garantir presença das chaves, preenchendo `null` quando não conhecido.
- O restante dos campos (`preco_original`, `comissao_percentual`, `frete_estimado`, `vendedor`, `fornecedor`, etc.) são opcionais e podem ser `null`.

4) Tratamento de erro

- Erros de chamada ao Serper (timeout, HTTP 4xx/5xx classificado não-retriável, resposta JSON inválida) são lançados como `SerperError` pela `SerperClient` e chegam ao chamador do `SerperService` (o workflow n8n deverá tratar/expor esse erro).
- Erros na validação do Brave (por exemplo, quota ou timeout) **não** fazem o `SerperService` falhar: o normalizador captura `BraveSearchError` e devolve a oferta com `fonte: 'serper'` e `validation_reason` preenchido com o motivo.

5) Comportamento quando não há resultados

- Se o Serper responder com objeto sem `shopping` ou com `shopping: []`, `SerperService.searchAndNormalize` retorna `[]` (array vazio). O workflow deve interpretar `[]` como "sem ofertas encontradas".

6) Comportamento quando o Brave não encontra link válido

- Quando um resultado do Serper for um redirect do Google Shopping (ex.: `google.com/search?ibp=oshop...`) e o `BraveSearchClient` estiver presente, o normalizador usa o Brave para tentar resolver um link de fornecedor.
  - Se o Brave encontrar um link válido: `link_produto` é substituído pelo link validado e `fonte` passa a ser `brave`.
  - Se o Brave não encontrar correspondência: o `link_produto` original do Serper é preservado, `fonte` permanece `serper`, e `validation_reason` recebe `"no_match"`.
  - Se o Brave lançar erro técnico, `validation_reason` conterá uma mensagem curta (não conterá chaves/segredos) e o fluxo prossegue retornando a oferta original com `fonte: 'serper'`.

7) Observações de integração n8n

- O n8n pode expor um endpoint ou um node function que chama `SerperService.searchAndNormalize(produto)` e processa a lista retornada (fazer ranking, calcular frete, aplicar comissão).
- Não chame o Brave diretamente do workflow; deixe o `SerperService`/normalizador gerenciar quando usar Brave (apenas para Google Shopping redirects).

8) Exemplos de tratamento de erro no n8n

- No case de `SerperError` (ex: 401/403/timeout), capturar a exceção e notificar o usuário (e.g., criar tarefa de revisão manual). Não exponha chaves ou detalhes sensíveis na mensagem de erro.

9) Justificativa sobre schema e regras de negócio

- Não alterei schema ou regras de negócio; a documentação reflete o comportamento atual do código: `custo_total` é calculado de forma conservadora (igual a `preco` quando disponível) e `comissao_percentual` / `frete_estimado` ficam `null` até que fontes confiáveis estejam disponíveis.

---

Se quiser, adiciono um exemplo de node n8n (JSON export) que consome um endpoint interno que usa `SerperService`.
