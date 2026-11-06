# Contrato interno — sellers-service

Rotas server-to-server, nunca chamadas pelo frontend. Protegidas por
`InternalApiKeyGuard`: todo request precisa do header `x-internal-api-key`
igual à variável `INTERNAL_API_KEY` deste serviço.

## O que sellers-service expõe (já implementado)

### `POST /api/v1/internal/sellers`

Implementa o contrato definido do lado de identity-service (ver
`docs/internal-api-contract.md` em `potala-identity-service`). Chamado por
`SellersServiceClient` logo depois que identity-service comita, no schema
`identity`, o `User` + `UserRole(SELLER)` + `UserProfile` do dono da loja.

Body esperado:

```json
{
  "userId": "uuid do User recém-criado em identity-service",
  "ownerName": "string",
  "legalName": "string",
  "tradeName": "string",
  "documentType": "CPF" | "CNPJ",
  "documentNumberDigits": "somente dígitos, já validado (check digits ok) por identity-service",
  "storeEmail": "string",
  "phone": "string",
  "description": "string | undefined"
}
```

O que este endpoint faz, numa transação local ao schema `sellers`:

1. Valida `userId` chamando `GET /api/v1/internal/users/:id` em
   identity-service (via `IdentityServiceClient.getUserById`) — defesa em
   profundidade: este serviço nunca persiste uma `SellerMembership` para um
   `userId` que não confirmou existir, mesmo que o valor só possa vir, hoje,
   de um cadastro que acabou de acontecer no chamador.
2. Recusa se o usuário já tiver uma `SellerMembership` (um usuário tem no
   máximo uma loja por enquanto — mesmo modelo do monólito de origem).
3. Gera um `slug` único a partir de `tradeName` (mesma função `slugify` +
   resolução de colisão por sufixo numérico do monólito de origem).
4. Cria `Seller` com `status = PENDING`, `commissionBps = null` (sem default
   comercial — mesma regra do monólito de origem).
5. Cria `SellerMembership` com `role = OWNER`, `userId` = o `userId`
   recebido, armazenado como UUID solto **sem FK** para `identity.usuarios`
   — a integridade referencial dessa referência é responsabilidade da
   aplicação (o passo 1 acima), não do Postgres, porque são schemas de
   serviços diferentes.

Respostas:

- `201`:
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
- `422` com `{ "message": "..." }` para: `documentNumberDigits` com
  tamanho incompatível com `documentType` (11 dígitos para CPF, 14 para
  CNPJ), `userId` que identity-service não reconhece, ou usuário que já
  possui uma `SellerMembership`
- Qualquer outro status é tratado por `SellersServiceClient` (em
  identity-service) como falha de serviço (503 devolvido ao cliente final,
  com compensação: apagar o `User` recém-criado)

### `GET /api/v1/internal/sellers/membership/:userId`

Adicionado ao construir `potala-catalog-service`. Resolve o mesmo dado que
`SellerContextGuard` (deste serviço) resolve localmente contra
`membros_vendedor` — só que para um userId vindo de **outro** serviço, que
não tem essa tabela. catalog-service chama isto de dentro do seu próprio
`SellerContextGuard` (versão de rede, em vez da versão local deste
serviço), no fluxo `POST /seller/products`.

Resposta:

- `200`, mesmo formato do `sellerContext` que este serviço anexa
  internamente à requisição:
  ```json
  {
    "membershipId": "uuid",
    "userId": "uuid",
    "sellerId": "uuid",
    "membershipRole": "OWNER" | "MANAGER" | "STAFF",
    "sellerStatus": "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED"
  }
  ```
- `404` se o `userId` não tiver nenhum vínculo de loja. **Nunca** um corpo
  vazio/`null` com `200` — o chamador precisa poder distinguir "sem loja"
  de uma falha de rede, o mesmo motivo pelo qual `IdentityServiceClient`
  deste serviço lança `ServiceUnavailableException` para qualquer status
  inesperado em vez de tratar como "não encontrado".

Este endpoint devolve o vínculo **independente do status da loja**
(inclusive `PENDING`/`REJECTED`/`SUSPENDED`) — quem decide se a operação
pode prosseguir é o equivalente ao `SellerActiveGuard` do lado de quem
chamou, não este endpoint.

## O que sellers-service espera que **identity-service** exponha (já existe)

### `POST /api/v1/internal/sessions/introspect`

Usado por `SessionAuthGuard` (via `IdentityServiceClient.introspectSession`)
em **toda** requisição autenticada a este serviço — `GET
/seller/onboarding/status`, `GET /admin/sellers`, `PATCH
/admin/sellers/:id/approve|reject|suspend`. Este serviço lê o cookie de
sessão (`SESSION_COOKIE_NAME`, deve ser o mesmo nome configurado em
identity-service) diretamente da requisição — ainda não existe api-gateway
para repassar um header de identidade confiável — e manda o valor cru para
este endpoint a cada request. `401` do lado de identity-service vira `401`
aqui; qualquer outro status inesperado vira `503` (nunca é tratado como "não
autenticado").

### `GET /api/v1/internal/users/:id`

Usado por `InternalController` (via `IdentityServiceClient.getUserById`)
para validar o `userId` recebido em `POST /internal/sellers` antes de
persistir a membership.

## Timeouts e resiliência

`IDENTITY_SERVICE_TIMEOUT_MS` (default 5000ms) limita quanto tempo este
serviço espera por identity-service antes de abortar. Diferente da relação
inversa em identity-service (onde `SELLERS_SERVICE_URL`/`SELLERS_SERVICE_API_KEY`
são opcionais, porque identity-service tinha rotas que funcionam sem
sellers-service), aqui `IDENTITY_SERVICE_URL`/`IDENTITY_SERVICE_API_KEY` são
**obrigatórias**: não existe rota autenticada neste serviço que funcione sem
identity-service — não há tabela de sessão local para cair de volta.

## O que orders-service (ainda não existe) provavelmente vai precisar daqui

Não implementado ainda — catalog-service só precisou do lookup por
`userId` acima (é chamado a partir do guard de autenticação, antes de
existir um `sellerId` para consultar). orders-service, mais adiante, vai
precisar confirmar que um `sellerId` já conhecido (vindo de um produto no
carrinho) ainda está `ACTIVE` no momento do checkout — um `GET
/api/v1/internal/sellers/:id` (por id, não por userId) é o caminho
natural, no mesmo padrão de `GET /internal/users/:id` em identity-service.
Deixado de fora desta v1 para não construir contrato especulativo —
revisar quando orders-service for de fato iniciado.
