# Marketplace Potala — identity-service

Primeiro serviço extraído do monólito (`marketing-place-potala-backend`) na
migração para microsserviços divididos por schema Postgres. Dono exclusivo
do schema `identity` no banco Supabase compartilhado do marketplace.

## Responsabilidade

Cadastro (customer e seller — este último em duas fases, ver
[`docs/internal-api-contract.md`](docs/internal-api-contract.md)), login,
logout, sessão server-side, `/auth/me`, e o endpoint interno que o
api-gateway (ainda não construído) usará para validar cookies de sessão sem
tocar neste banco diretamente.

**Não é dono de**: lojas (`Seller`/`SellerMembership` → sellers-service,
ainda não existe), catálogo, pedidos. Ver a análise de arquitetura completa
no projeto Claude (`potala-api-gateway`) para o mapa dos demais serviços.

## Stack

- Node.js 20+ / NestJS / TypeScript strict
- Prisma 6 (`previewFeatures = ["multiSchema"]`) + PostgreSQL (Supabase)
- REST + OpenAPI (`/api/v1`)
- Argon2id + cookie HttpOnly — igual ao monólito de origem, nada mudou na
  forma de autenticar o usuário final

## O que já existe

- `POST /auth/customer/register`, `POST /auth/seller/register`,
  `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /customers/me`
- `POST /internal/sessions/introspect`, `GET /internal/users/:id`
  (protegidos por `x-internal-api-key`)
- `GET /health`, `GET /health/ready`
- Suíte de testes adaptada do monólito (guards, env validation, documentos
  BR, sessão, fluxo de registro com compensação)

## O que ainda não existe

sellers-service em si (então `POST /auth/seller/register` responde `503`
até `SELLERS_SERVICE_URL`/`SELLERS_SERVICE_API_KEY` apontarem para um
serviço real), api-gateway, verificação de e-mail, recuperação de senha.

## Por que este serviço não tem mais `Seller`/`SellerMembership`

No monólito, `POST /auth/seller/register` criava `User` + `Seller` +
`SellerMembership` numa única transação Postgres. Isso só é possível porque
tudo vivia no mesmo schema. Separado em serviços, `Seller` passa a pertencer
ao schema `sellers` (outro serviço, outra base de deploy). Este serviço:

1. Cria `User` + `UserRole(SELLER)` + `UserProfile` localmente (uma
   transação Postgres normal, só no schema `identity`).
2. Chama sellers-service por HTTP para criar a loja.
3. Se a chamada falhar, apaga o `User` que acabou de criar (compensação) e
   devolve erro ao cliente.

Essa é a decisão de arquitetura confirmada para a v1: chamada HTTP síncrona
entre serviços, sem barramento de eventos por enquanto. Está documentada com
o contrato completo em
[`docs/internal-api-contract.md`](docs/internal-api-contract.md) — é esse
arquivo que dita o que o futuro `potala-sellers-service` precisa implementar.

Pelo mesmo motivo, `GET /auth/me` não retorna mais informação de loja. Um
frontend que precisa saber se o usuário SELLER já tem loja ativa deve chamar
`GET /seller/onboarding/status` no sellers-service separadamente (esse
endpoint já existe no monólito de origem e deve migrar praticamente sem
alteração).

## Requisitos

- Node.js >= 20
- npm
- Um projeto Supabase (PostgreSQL) — pode ser o mesmo projeto usado pelos
  outros serviços, desde que cada um migre **apenas o seu próprio schema**

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha `DATABASE_URL` / `DIRECT_URL` com as credenciais do Supabase, e
gere `INTERNAL_API_KEY` com:

```bash
openssl rand -hex 32
```

## Banco de dados / Supabase

Este serviço usa `previewFeatures = ["multiSchema"]` do Prisma: o
`schema.prisma` já declara `schemas = ["identity"]` e cada model tem
`@@schema("identity")`. Isso significa que:

- `npx prisma migrate dev` / `migrate deploy` cria o schema `identity` no
  Postgres automaticamente (`CREATE SCHEMA IF NOT EXISTS "identity"`) e só
  cria/altera tabelas dentro dele.
- A tabela de controle de migrations do Prisma (`_prisma_migrations`) fica
  dentro do próprio schema `identity` — não colide com a de outros serviços,
  mesmo que todos usem a mesma `DATABASE_URL`/banco Supabase.
- **Não** aponte `DATABASE_URL` com `?schema=public` nem para qualquer schema
  específico — o Prisma já decide isso via `schemas` no datasource.

Primeira vez, num banco Supabase novo/vazio:

```bash
npx prisma migrate deploy   # aplica prisma/migrations/ (schema identity)
npm run prisma:seed          # cria o admin a partir de ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME
```

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

- Liveness: `GET http://localhost:3001/api/v1/health`
- Readiness: `GET http://localhost:3001/api/v1/health/ready`
- Swagger: `http://localhost:3001/api/v1/docs`

## Testes, lint e build

```bash
npm test
npm run lint
npm run build
```

## Variáveis de ambiente

Ver [`.env.example`](.env.example) — comentado variável a variável,
incluindo as novas em relação ao monólito (`INTERNAL_API_KEY`,
`SELLERS_SERVICE_URL`, `SELLERS_SERVICE_API_KEY`,
`SELLERS_SERVICE_TIMEOUT_MS`, `INTERNAL_THROTTLE_LIMIT`).

## Próximos passos sugeridos (fora do escopo deste serviço)

1. `potala-api-gateway`: único ponto de entrada do frontend, valida sessão
   chamando `POST /internal/sessions/introspect` aqui, repassa contexto de
   usuário para os demais serviços.
2. `potala-sellers-service`: implementa o contrato em
   `docs/internal-api-contract.md` para destravar `POST /auth/seller/register`.
3. Frontend: trocar a camada demo (`localStorage`) por chamadas reais a
   `/auth/*` e `/customers/me` deste serviço, mantendo cookie HttpOnly
   (`credentials: 'include'` em todo fetch).
