# Marketplace Potala — sellers-service

Segundo serviço extraído do monólito (`marketing-place-potala-backend`) na
migração para microsserviços divididos por schema Postgres. Dono exclusivo
do schema `sellers` no banco Supabase compartilhado do marketplace.

## Responsabilidade

Lojas (`Seller`/`SellerMembership`), onboarding do vendedor (status da
loja) e revisão administrativa (aprovar/rejeitar/suspender lojas). Recebe a
segunda fase do cadastro de vendedor iniciado por identity-service — ver
[`docs/internal-api-contract.md`](docs/internal-api-contract.md).

**Não é dono de**: identidade/login/sessão (identity-service), catálogo,
pedidos. Este serviço não tem tabela de usuário nem de sessão — toda
autenticação depende de uma chamada a identity-service (ver abaixo).

## Stack

- Node.js 20+ / NestJS / TypeScript strict
- Prisma 6 (`previewFeatures = ["multiSchema"]`) + PostgreSQL (Supabase)
- REST + OpenAPI (`/api/v1`)

## O que já existe

- `GET /seller/onboarding/status` — status da loja para o dono/membro
  autenticado (`@Roles(SELLER)` + `SellerContextGuard`)
- `GET /admin/sellers` (paginado por cursor), `PATCH
  /admin/sellers/:id/approve|reject|suspend` (`@Roles(ADMIN)`), cada
  aprovação/rejeição/suspensão grava um `AuditLog` local
- `POST /internal/sellers` (protegido por `x-internal-api-key`) — o que
  identity-service chama para completar o cadastro de vendedor
- `GET /internal/sellers/membership/:userId` (protegido por
  `x-internal-api-key`) — adicionado ao construir catalog-service: resolve
  o vínculo de loja (sellerId, papel, status) de um userId, para o guard de
  contexto de vendedor de **outro** serviço, que não tem `membros_vendedor`
  localmente. Ver [`docs/internal-api-contract.md`](docs/internal-api-contract.md).
- `GET /health`, `GET /health/ready`
- Suíte de testes: guards (incluindo o `SessionAuthGuard` baseado em rede,
  mockando `IdentityServiceClient`), paginação, onboarding, revisão
  administrativa

## O que ainda não existe

api-gateway com validação de sessão centralizada (então este serviço
continua lendo o cookie de sessão diretamente e chamando identity-service a
cada request — ver abaixo), `GET /internal/sellers/:id` por sellerId
(orders-service provavelmente vai precisar disso — ver
[`docs/internal-api-contract.md`](docs/internal-api-contract.md)), endpoints
de gestão de `SellerMembership` além do `OWNER` inicial (convidar
`MANAGER`/`STAFF` — existia no monólito? não: o monólito de origem também
só criava `OWNER` no registro; gestão de membros adicionais nunca existiu,
não é regressão).

## Por que a autenticação aqui é diferente de identity-service

identity-service tem sua própria tabela `Session` e valida o cookie
localmente. Este serviço **não tem** — `SessionAuthGuard` aqui lê o mesmo
cookie HttpOnly (mesmo `SESSION_COOKIE_NAME`, emitido pelo login em
identity-service) direto da requisição e resolve o token chamando `POST
/internal/sessions/introspect` em identity-service a cada request, via
`IdentityServiceClient`. Funciona hoje porque não existe api-gateway e o
cookie é válido para todas as origens de localhost/mesmo domínio — quando
`potala-api-gateway` existir, este guard deve ser trocado por um que confia
num header de identidade que o gateway já validou, eliminando essa chamada
de rede por request. Essa dívida está documentada intencionalmente, não é
um descuido.

Pela mesma razão, `IDENTITY_SERVICE_URL`/`IDENTITY_SERVICE_API_KEY` são
**obrigatórias** aqui (ao contrário de `SELLERS_SERVICE_URL` em
identity-service, que é opcional): não existe uma única rota autenticada
neste serviço capaz de responder sem identity-service no ar.

## Requisitos

- Node.js >= 20
- npm
- Um projeto Supabase (PostgreSQL) — o mesmo projeto usado pelos outros
  serviços, desde que cada um migre **apenas o seu próprio schema**
- identity-service rodando e alcançável (para toda rota autenticada)

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha `DATABASE_URL` / `DIRECT_URL` com as credenciais do Supabase, gere
`INTERNAL_API_KEY` com `openssl rand -hex 32`, e aponte
`IDENTITY_SERVICE_URL`/`IDENTITY_SERVICE_API_KEY` para uma instância real de
identity-service (a mesma chave configurada como `INTERNAL_API_KEY` lá, ou
uma dedicada — identity-service precisa reconhecer o valor enviado).

## Banco de dados / Supabase

Mesmo padrão de identity-service: `previewFeatures = ["multiSchema"]`,
`schemas = ["sellers"]`, `@@schema("sellers")` em cada model/enum. `npx
prisma migrate deploy` cria o schema `sellers` automaticamente e só
cria/altera tabelas dentro dele — não colide com `identity` nem com
qualquer outro schema, mesmo compartilhando `DATABASE_URL`.

**Não** aponte `DATABASE_URL` com `?schema=public` nem para qualquer schema
específico — o Prisma já decide isso via `schemas` no datasource.

Primeira vez, num banco Supabase novo/vazio (ou já com o schema `identity`
de outro serviço — não há conflito):

```bash
npx prisma migrate deploy   # aplica prisma/migrations/ (schema sellers)
```

Não há seed neste serviço (ao contrário de identity-service, que semeia o
admin) — não há conceito de administrador local aqui, o papel `ADMIN` vem
de `identity.usuarios` via `roles` no token introspectado.

Em desenvolvimento local com banco isolado, para criar novas migrations:

```bash
npx prisma migrate dev --name <nome_da_mudanca>
```

Nunca rode `prisma migrate reset` nem `prisma db push` contra o Supabase
compartilhado com outros serviços.

## Execução local

```bash
npm run start:dev
```

- Liveness: `GET http://localhost:3002/api/v1/health`
- Readiness: `GET http://localhost:3002/api/v1/health/ready`
- Swagger: `http://localhost:3002/api/v1/docs`

## Testes, lint e build

```bash
npm test
npm run lint
npm run build
```

Assim como em identity-service, este código **não foi executado** neste
ambiente (sandbox sem acesso a `registry.npmjs.org`) — revisado
manualmente, mas `npm install && npm test && npm run build` local é o
próximo passo obrigatório antes de qualquer deploy.

## Variáveis de ambiente

Ver [`.env.example`](.env.example) — comentado variável a variável.

## Próximos passos sugeridos (fora do escopo deste serviço)

1. `potala-api-gateway`: único ponto de entrada do frontend, valida sessão
   uma vez chamando `POST /internal/sessions/introspect` em identity-service
   e repassa contexto de usuário para os demais serviços — quando existir,
   troca o `SessionAuthGuard` deste serviço pelo baseado em header de
   gateway, eliminando a chamada de rede por request.
2. `potala-catalog-service`: vai precisar de um `GET
   /internal/sellers/:id` aqui para confirmar que uma loja existe e está
   `ACTIVE` antes de aceitar a criação de um produto — ver a nota em
   [`docs/internal-api-contract.md`](docs/internal-api-contract.md).
3. Frontend: trocar a camada demo (`localStorage`) por chamadas reais a
   `/seller/onboarding/status` e `/admin/sellers*` deste serviço, mantendo
   cookie HttpOnly (`credentials: 'include'` em todo fetch) — mesma
   orientação de identity-service.
