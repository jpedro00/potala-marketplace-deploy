# Marketplace Potala — catalog-service

Quarto serviço da migração para microsserviços. Dono do schema Postgres
`catalog` — categorias, produtos, variantes e estoque. Extraído de
`marketing-place-potala-backend-main` (`modules/categories`,
`modules/products`, `modules/inventory`).

## Escopo desta v1 — decisão explícita do Arthur

O monólito de origem só tem: listagem de categorias ativas (sem controller
HTTP exposto — só o service), e produtos com CRUD parcial escopado ao
vendedor (criar, listar, buscar — sem editar/excluir, sem imagem, sem
navegação pública). **Não existe hoje nenhum endpoint público de vitrine**
(listar/buscar produto ativo, ver por slug, navegar por categoria) em
lugar nenhum do sistema — é um gap real do monólito, não deste serviço.

Ao construir este serviço, a opção escolhida foi **porte 1:1 estrito**: o
que já existe no monólito é portado fielmente; o que não existe (vitrine
pública, edição/exclusão de produto, imagens, gestão administrativa de
categoria) fica de fora, documentado como gap conhecido — não implementado
"de graça" nem decidido nas costas do Arthur. Ver "O que este v1 não faz"
abaixo para a lista completa.

## Responsabilidade

- `GET /seller/products` (paginado por cursor), `POST /seller/products`,
  `GET /seller/products/:id` — CRUD parcial de produto escopado à loja do
  vendedor autenticado (`@Roles(SELLER)` + `SellerContextGuard` +
  `SellerActiveGuard`). Cada produto é criado com pelo menos uma variante e
  o estoque inicial de cada variante, numa única transação.
- `CategoriesService.listActive()` — existe e é usado internamente
  (validação de categoria na criação de produto), mas **sem controller HTTP**
  nesta v1 — mesmo gap do monólito, não uma regressão. Ver abaixo.
- `InventoryService` (reserve/release/commit atômicos, `UPDATE ... WHERE`
  único, sem `SELECT` seguido de `UPDATE`) — portado e testado, mas **sem
  nenhuma rota HTTP** nesta v1, porque o único chamador possível
  (checkout) ainda não existe. Ver abaixo.
- `GET /health`, `GET /health/ready`.

## O que este v1 **não** faz (decisão deliberada, documentada)

- **Vitrine pública** (listar/buscar produtos ativos, produto por slug,
  navegar por categoria): não existe em lugar nenhum do sistema hoje —
  nem no monólito, nem aqui. Ao decidir o escopo deste serviço, a opção
  "porte 1:1 + vitrine pública" foi apresentada e **não** escolhida; ficou
  como próximo passo natural, não como trabalho silenciosamente adiado.
- **`GET /categories` HTTP**: `CategoriesService.listActive()` existe e
  funciona, mas nenhum controller o expõe — exatamente como no monólito.
  Na prática, hoje não há como nenhum cliente (nem o painel do vendedor)
  descobrir um `categoryId` válido via HTTP — só inspecionando o banco
  diretamente. Herdado, não introduzido aqui.
- **`PATCH`/`DELETE` de produto e variante, upload de imagem**: nunca
  existiram no monólito.
- ~~Estoque via HTTP~~: feito nesta atualização — ver a seção
  "Rotas `/internal/*` deste serviço" acima.
- **Validação de sessão centralizada**: como sellers-service, este serviço
  ainda lê o cookie e chama identity-service a cada request — sem
  api-gateway v1 fazendo isso uma vez só. Ver abaixo.

## Por que a autenticação e o contexto de vendedor aqui são resolvidos por rede

Este serviço não tem tabela de sessão (`SessionAuthGuard` chama
identity-service, mesmo padrão de sellers-service) **nem** tabela de vínculo
de vendedor (`membros_vendedor`) — `SellerContextGuard` aqui chama
sellers-service via uma rota nova, adicionada especificamente para isto:
`GET /internal/sellers/membership/:userId`. É a mesma peça que resolvia
localmente no monólito (e ainda resolve localmente dentro do próprio
sellers-service), só que um serviço mais longe agora. Ver
[`docs/internal-api-contract.md`](docs/internal-api-contract.md) para o
contrato completo dos dois lados.

Por isso `IDENTITY_SERVICE_URL`/`IDENTITY_SERVICE_API_KEY` **e**
`SELLERS_SERVICE_URL`/`SELLERS_SERVICE_API_KEY` são todas obrigatórias
aqui — nenhuma rota autenticada deste serviço responde sem as duas
dependências no ar.

## Rotas `/internal/*` deste serviço — adicionadas para orders-service

Este serviço passou a expor suas próprias rotas internas (`INTERNAL_API_KEY`
próprio, `InternalApiKeyGuard`, segundo grupo de throttle — mesmo padrão de
sellers-service) quando orders-service se tornou o primeiro consumidor:

- `POST /internal/product-variants/resolve` — resolve preço/vendedor/status/
  estoque autoritativos para um conjunto de `variantId`s. orders-service
  nunca confia em productId/variantId/preço/sellerId vindos do próprio
  cliente dele — sempre resolve aqui antes de fechar um pedido.
- `POST /internal/inventory/reserve|release|commit` — expõe
  `InventoryService` (reserve/release/commit atômicos, já portados e
  testados desde a v1 original) por HTTP, em lote e tudo-ou-nada (uma única
  transação Postgres para o lote inteiro). checkout de orders-service
  reserva depois de criar o Order localmente, comete quando o pagamento é
  aprovado, libera quando falha.

Ver [`docs/internal-api-contract.md`](docs/internal-api-contract.md) para o
contrato completo dos dois lados.

## Por que `sellerId` nunca é revalidado dentro da transação de criação de produto

No monólito, `Product.sellerId` tinha FK real para `Seller`, mas `sellerId`
sempre chegava já resolvido pelo guard local — a FK era defesa em
profundidade, não a validação em si. Aqui, sem FK cross-schema possível, a
mesma garantia vem inteira de `SellerContextGuard` (uma chamada de rede real
a sellers-service, antes de qualquer transação começar) — revalidar de novo
dentro de `ProductsService.createForSeller` seria uma chamada de rede
redundante e, pior, manteria uma transação Postgres aberta esperando uma
resposta de rede. Detalhe completo em
[`docs/internal-api-contract.md`](docs/internal-api-contract.md).

## Stack

- Node.js 20+ / NestJS / TypeScript strict
- Prisma 6 (`previewFeatures = ["multiSchema"]`), schema Postgres `catalog`
- `class-validator` / `class-transformer`, `@nestjs/throttler`, Swagger

## Requisitos

- Node.js >= 20
- npm
- Um projeto Supabase (PostgreSQL) — o mesmo projeto usado pelos outros
  serviços, desde que cada um migre **apenas o seu próprio schema**
- identity-service **e** sellers-service rodando e alcançáveis (toda rota
  autenticada precisa dos dois)

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha `DATABASE_URL` / `DIRECT_URL` com as credenciais do Supabase, gere
as chaves internas com `openssl rand -hex 32` (devem bater com
`INTERNAL_API_KEY` de identity-service e de sellers-service, respectivamente
— ver `.env.example`), depois:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Execução local

```bash
npm run start:dev
```

- Liveness: `GET http://localhost:3003/api/v1/health` — sempre `200`.
- Readiness: `GET http://localhost:3003/api/v1/health/ready` — `200` só se
  o Postgres deste serviço responder; não verifica identity-service nem
  sellers-service (mesmo padrão de sellers-service — cada serviço só
  reporta a própria saúde).

## Testes, lint e build

```bash
npm test
npm run lint
npm run build
```

Como nos outros três serviços, **não executado neste ambiente** (sandbox
sem acesso a `registry.npmjs.org`) — revisado manualmente (consistência de
imports, balanceamento de chaves/parênteses, schema Prisma comparado à
migration SQL escrita à mão, testes portados linha a linha dos specs
originais do monólito onde existiam). `npm install && npm test && npm run
build` local é o próximo passo obrigatório antes de qualquer deploy.

A suíte de testes cobre: `ProductsService` (paginação, isolamento por
tenant, criação transacional, discriminação de conflito único SKU/slug,
retry de slug — portado quase linha a linha do `products.service.spec.ts`
original), `InventoryService` (operações atômicas, incluindo um teste de
race condition modelado), `InternalService` (resolução de variante com
fallback de preço, lote de reserva tudo-ou-nada incluindo o caso de
rollback), `CreateProductDto`, paginação, `env.validation`, e os guards
(`SessionAuthGuard` mockando `IdentityServiceClient`, `SellerContextGuard`
mockando `SellersServiceClient`, `OriginGuard` incluindo a isenção de
`/internal/*`).

## Variáveis de ambiente

Ver [`.env.example`](.env.example) — comentado variável a variável.

## Próximos passos sugeridos (fora do escopo deste serviço)

1. **Vitrine pública**: `GET /products` (paginado, filtro por categoria,
   só `status: ACTIVE`), `GET /products/:slug`, e o `GET /categories` que
   falta desde o monólito. Opção já apresentada e conscientemente adiada
   ao decidir o escopo da v1 original — não esquecida.
2. Centralizar a validação de sessão (e, possivelmente, do contexto de
   vendedor) em `potala-api-gateway`, eliminando as duas chamadas de rede
   por requisição autenticada que este serviço faz hoje.
3. `PATCH`/`DELETE` de produto e variante, upload de imagem — nunca
   existiram no monólito; ficam para quando o Arthur decidir priorizar.
4. `GET /internal/sellers/:id` (por sellerId, não userId) — orders-service
   pode vir a precisar validar um `sellerId` resolvido por este serviço
   contra o status atual da loja em sellers-service, dependendo de como o
   fluxo de checkout evoluir.
