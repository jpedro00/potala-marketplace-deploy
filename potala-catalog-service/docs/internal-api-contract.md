# Contrato interno — catalog-service

Este serviço é cliente das rotas internas de identity-service e
sellers-service (primeira seção abaixo) e, desde que orders-service passou
a existir, também expõe suas próprias rotas `/internal/*` (segunda seção) —
`InternalApiKeyGuard` + `INTERNAL_API_KEY` próprios, mesmo padrão de
identity-service e sellers-service.

## O que catalog-service espera que **identity-service** exponha (já existe)

### `POST /api/v1/internal/sessions/introspect`

Usado por `SessionAuthGuard` (via `IdentityServiceClient.introspectSession`)
em toda requisição autenticada a este serviço — hoje, todo o grupo
`GET/POST /seller/products*`. Este serviço lê o cookie de sessão
(`SESSION_COOKIE_NAME`, deve ser o mesmo nome configurado em
identity-service) diretamente da requisição — ainda não existe api-gateway
para repassar um header de identidade confiável — e manda o valor cru para
este endpoint a cada request. `401` do lado de identity-service vira `401`
aqui; qualquer outro status inesperado vira `503` (nunca é tratado como "não
autenticado"). Mesmo padrão que sellers-service já usa para o mesmo
propósito.

## O que catalog-service espera que **sellers-service** exponha (já existe)

### `GET /api/v1/internal/sellers/membership/:userId`

Adicionado a sellers-service especificamente para este serviço, ao construir
catalog-service (ver o `docs/internal-api-contract.md` de sellers-service).
Usado por `SellerContextGuard` (via
`SellersServiceClient.getMembershipByUserId`) no grupo `seller/products` —
resolve o mesmo dado que o `SellerContextGuard` local do monólito resolvia
com uma única query em `membros_vendedor`, só que por chamada de rede, já
que este serviço não tem essa tabela.

Resposta esperada:

- `200`:
  ```json
  {
    "membershipId": "uuid",
    "userId": "uuid",
    "sellerId": "uuid",
    "membershipRole": "OWNER" | "MANAGER" | "STAFF",
    "sellerStatus": "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED"
  }
  ```
- `404` se o `userId` não tiver nenhum vínculo de loja — mapeado para `403
  Seller membership not found` aqui, mesmo comportamento que o guard local
  do monólito tinha para o caso equivalente.
- Qualquer outro status inesperado vira `503` (`SellersServiceClient`), nunca
  é tratado como "sem loja".

O vínculo retornado **não** garante `sellerStatus: ACTIVE` — quem decide se
a operação pode prosseguir é `SellerActiveGuard`, aplicado depois, exatamente
como no monólito e em sellers-service.

## O que este serviço expõe para **orders-service**

### `POST /internal/product-variants/resolve`

Body: `{ "variantIds": ["uuid", ...] }` (1..50, únicos). Resolve, para cada
id encontrado, os dados autoritativos que orders-service precisa para
fechar um checkout sem confiar em nada vindo do próprio cliente dele:

```json
[
  {
    "variantId": "uuid",
    "productId": "uuid",
    "sellerId": "uuid",
    "productStatus": "DRAFT" | "REVIEW" | "ACTIVE" | "REJECTED" | "INACTIVE",
    "productTitle": "string",
    "sku": "string",
    "variantName": "string",
    "unitPriceCents": 1234,
    "availableQuantity": 10
  }
]
```

`unitPriceCents` é `ProductVariant.priceCents` quando definido, senão
`Product.priceCents` — o mesmo "preço efetivo" que uma vitrine mostraria.
`availableQuantity` é `quantidade - quantidade_reservada` no momento da
chamada — **não é uma reserva**; é só o que orders-service usa para uma
checagem antecipada (a checagem autoritativa e atômica acontece em
`/internal/inventory/reserve`, abaixo). Ids sem variante correspondente são
simplesmente omitidos da resposta — não é erro; orders-service é quem sabe
se um id ausente deve virar "linha de carrinho inválida" para o cliente
dele.

### `POST /internal/inventory/reserve|release|commit`

Body para os três: `{ "items": [{ "variantId": "uuid", "quantity": 1 }, ...] }`
(1..50 itens). Expõe `InventoryService` (reserve/release/commit atômicos via
`UPDATE ... WHERE`, sem `SELECT` seguido de `UPDATE` — inalterado desde a v1
original) por HTTP, em lote e **tudo-ou-nada**: cada chamada abre uma única
transação Postgres cobrindo todos os itens do lote — se qualquer item falhar
(ex: estoque insuficiente num item no meio do lote), a transação inteira faz
rollback e nenhum item do lote fica parcialmente reservado/liberado/comprometido.
Isso é o que permite a orders-service tratar "reservar os itens de um pedido"
como uma única operação atômica, sem precisar implementar sua própria
compensação item-a-item para esta chamada especificamente.

- `reserve`: `409 Insufficient stock` (mapeado de `InsufficientStockException`)
  se qualquer item não tiver estoque disponível suficiente. Chamado por
  orders-service logo depois de criar o `Order` localmente (`PENDING_PAYMENT`),
  antes de chamar o gateway de pagamento.
- `commit`: transforma a reserva em estoque consumido (venda). Chamado
  quando o gateway de pagamento aprova a cobrança.
- `release`: desfaz uma reserva anterior. Chamado quando o pagamento falha,
  ou como compensação se algo dá errado depois do reserve.

Nenhuma das três é idempotente por `orderId` nesta v1 — não há chave de
idempotência própria por pedido, só a atomicidade do lote em si. Uma
repetição de rede (o cliente não recebe a resposta e tenta de novo) pode
reservar/liberar/comprometer duas vezes. Gap conhecido, documentado aqui e
no README de orders-service — não resolvido especulativamente agora.

## Por que este serviço nunca revalida `sellerId` dentro de `ProductsService`

No monólito, `Product.sellerId` tinha uma FK real para `Seller` — mas
`sellerId` sempre chegava já resolvido pelo guard local (nunca era entrada
bruta de cliente), então a FK era defesa em profundidade, não a validação em
si. Aqui, sem FK cross-schema possível, a mesma garantia vem de
`SellerContextGuard`: por construção, todo `sellerId` que chega a
`ProductsService.createForSeller` já passou por uma chamada de rede real a
sellers-service (na hora de resolver `request.sellerContext`), então
revalidá-lo de novo dentro da transação seria uma segunda chamada de rede
redundante — e, pior, abriria uma transação Postgres enquanto espera uma
resposta de rede, o mesmo anti-padrão que o comentário do model `Inventory`
já adverte para checkout ("MUST NOT hold a transaction open while calling a
payment gateway"). Por isso a validação acontece só uma vez, no guard, antes
da transação começar.

## Timeouts e resiliência

`IDENTITY_SERVICE_TIMEOUT_MS` e `SELLERS_SERVICE_TIMEOUT_MS` (default
5000ms cada) limitam quanto tempo este serviço espera por cada dependência
antes de abortar. As duas são obrigatórias — diferente de identity-service
(onde `SELLERS_SERVICE_URL` é opcional): não existe rota autenticada neste
serviço capaz de responder sem os dois no ar (autenticação depende de
identity-service; toda rota do grupo `seller/products` depende também de
sellers-service).

## Rate limit do grupo interno

`INTERNAL_THROTTLE_LIMIT` (default 600/janela) — mais alto que o grupo
público (`THROTTLE_LIMIT`, default 60/janela): um checkout de orders-service
pode disparar várias chamadas internas em sequência (resolve + reserve, e
depois commit ou release), então o grupo interno precisa de mais margem que
o tráfego de um único navegador. Mesmo padrão de sellers-service.
