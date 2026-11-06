# Contrato interno — identity-service

Rotas server-to-server, nunca chamadas pelo frontend. Protegidas por
`InternalApiKeyGuard`: todo request precisa do header `x-internal-api-key`
igual à variável `INTERNAL_API_KEY` deste serviço.

## O que identity-service expõe (já implementado)

### `POST /api/v1/internal/sessions/introspect`

Resolve um token de sessão (o valor cru do cookie, não o hash) para a
identidade autenticada. Feito para o **api-gateway**: o gateway recebe o
cookie do navegador, chama este endpoint para validar, e repassa o resultado
para os demais serviços via header interno confiável — os demais serviços não
devem precisar bater no identity-service a cada request.

Body:

```json
{ "token": "<valor bruto do cookie potala_session>" }
```

Resposta `200`:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "status": "ACTIVE",
  "roles": ["CUSTOMER"]
}
```

Resposta `401` se o token for inválido, expirado, revogado, ou o usuário
estiver `BLOCKED`.

### `GET /api/v1/internal/users/:id`

Lookup mínimo de identidade por id. Para um serviço que só guarda uma
referência solta a `userId` (sem FK — ver análise de arquitetura) e precisa
confirmar que o usuário existe / está ativo antes de agir sobre ele.

Resposta `200`: mesmo formato do introspect. `404` se não existir.

## O que identity-service espera que **sellers-service** exponha (ainda não existe)

`AuthService.registerSeller` (em `POST /auth/seller/register`) faz um
cadastro em duas fases:

1. **Local, transacional**: cria `User` + `UserRole(SELLER)` + `UserProfile`
   no schema `identity`. Commit.
2. **Remota, síncrona**: chama `SellersServiceClient.createSellerForOwner`,
   que faz `POST {SELLERS_SERVICE_URL}/api/v1/internal/sellers`.

Se o passo 2 falhar (rede, 5xx, timeout), identity-service **compensa**
apagando o `User` recém-criado (cascade remove role e profile) e devolve o
erro ao cliente. Não há transação distribuída entre os dois schemas — esta é
a tradeoff deliberada da v1 (ver análise de arquitetura: HTTP síncrono +
compensação, não saga/event bus).

`sellers-service` precisa implementar:

### `POST /api/v1/internal/sellers`

Body enviado por identity-service:

```json
{
  "userId": "uuid do User recém-criado em identity-service",
  "ownerName": "string",
  "legalName": "string",
  "tradeName": "string",
  "documentType": "CPF" | "CNPJ",
  "documentNumberDigits": "somente dígitos, já validado (check digits ok)",
  "storeEmail": "string",
  "phone": "string",
  "description": "string | undefined"
}
```

Deve criar, numa transação local ao schema `sellers`:

- `Seller` com `status = PENDING`, `commissionBps = null` (sem default
  comercial — mesma regra do monólito de origem)
- `SellerMembership` com `role = OWNER`, `userId` = o `userId` recebido
  (armazenado como UUID solto, **sem FK** para `identity.usuarios` — a
  integridade referencial dessa referência é responsabilidade da aplicação,
  não do Postgres, porque são schemas de serviços diferentes)

Respostas esperadas:

- `201` com o corpo:
  ```json
  {
    "sellerId": "uuid",
    "tradeName": "string",
    "slug": "string",
    "status": "PENDING",
    "membershipId": "uuid",
    "membershipRole": "OWNER"
  }
  ```
- `409` se já existir uma loja com o mesmo `(documentType, documentNumberDigits)`
- `422` com `{ "message": "..." }` para qualquer outro erro de validação de
  domínio
- Qualquer outro status é tratado por `SellersServiceClient` como falha de
  serviço (503 devolvido ao cliente, com compensação no lado identity)

`sellers-service` deve validar o `userId` recebido chamando
`GET /api/v1/internal/users/:id` neste serviço antes de persistir a
membership, para nunca criar uma `SellerMembership` para um usuário que não
existe (defesa em profundidade — o `userId` já vem de uma criação que acabou
de acontecer, mas a validação evita acoplar às garantias internas do
chamador).

## Timeouts e resiliência

`SELLERS_SERVICE_TIMEOUT_MS` (default 5000ms) limita quanto tempo
identity-service espera por sellers-service antes de abortar e compensar.
Enquanto `SELLERS_SERVICE_URL` / `SELLERS_SERVICE_API_KEY` não estiverem
configuradas, `POST /auth/seller/register` responde `503` de forma
controlada e clara — o serviço não trava nem lança erro genérico.
