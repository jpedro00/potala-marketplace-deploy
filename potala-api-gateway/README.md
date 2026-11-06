# Marketplace Potala — api-gateway

Terceiro serviço da migração para microsserviços. Diferente de
identity-service e sellers-service, este não é dono de nenhum schema
Postgres — não tem banco de dados próprio. É o ponto único de entrada
público: o frontend passa a falar só com ele, e ele decide para qual
serviço encaminhar cada requisição.

Construído do zero (não reaproveita o scaffold `nest new` que já existia em
`potala-api-gateway` no seu computador — ver nota de entrega no final deste
README).

## Responsabilidade

Reverse proxy transparente por prefixo de rota:

| Prefixo | Destino |
|---|---|
| `/api/v1/auth/*`, `/api/v1/customers/*` | identity-service |
| `/api/v1/seller/products/*` | catalog-service |
| `/api/v1/seller/*` (resto), `/api/v1/admin/sellers/*` | sellers-service |
| `/api/v1/orders/*` | orders-service |
| `/api/v1/internal/*` | **bloqueado** — nunca chega a nenhum serviço através do gateway |
| `/api/v1/health`, `/api/v1/health/ready` | respondido pelo próprio gateway (não é proxy) |

`/api/v1/orders` não disputa prefixo com nenhum outro serviço — diferente de
`/api/v1/seller`, orders-service é dono do prefixo inteiro, então a ordem de
registro dessa rota em `proxy/proxy-routes.ts` não importa.

`/api/v1/seller/*` já não é um prefixo "um serviço só" — sellers-service
(onboarding) e catalog-service (produtos) dividem o mesmo prefixo por
recurso. `/api/v1/seller/products` precisa estar registrado **antes** de
`/api/v1/seller` em `proxy/proxy-routes.ts` (Express casa `app.use()` na
ordem de registro); ver o comentário nesse arquivo e
`proxy-routes.spec.ts` para o teste que trava essa ordem.

Além do roteamento: helmet, CORS, e um rate limit global grosso por IP na
borda (proteção do gateway e, por tabela, de tudo atrás dele — limites finos
por rota continuam em cada serviço, sem mudança).

## O que este v1 **não** faz (decisão deliberada, documentada)

Cada serviço continua validando a própria sessão exatamente como hoje: lê o
cookie `potala_session` e chama `POST /internal/sessions/introspect` em
identity-service a cada request (ver os READMEs de identity-service e
sellers-service). O gateway **não** centraliza essa validação nem injeta um
header de identidade confiável para os serviços de baixo — ele só encaminha
a requisição, cookie incluso, sem tocar nela.

Isso é intencional para o v1: dá o benefício imediato (um único ponto de
entrada, uma única origem CORS, portas dos serviços escondidas do frontend)
sem precisar mexer em código já entregue e revisado dos outros dois
serviços. A otimização óbvia — validar a sessão uma vez aqui e repassar um
header confiável, eliminando a chamada de rede duplicada em cada serviço —
fica para quando o custo disso for medido e valer a pena; os dois READMEs
dos outros serviços já anticipavam essa migração futura no guard
(`SessionAuthGuard`).

Pela mesma razão, o `OriginGuard` de cada serviço continua sendo a defesa
real contra CSRF em requisições mutantes — o gateway repassa o header
`Origin` sem alterá-lo, então nada muda ali. O `enableCors` deste gateway é
só sobre o que o navegador permite chamar (preflight/`Access-Control-Allow-Origin`),
não uma segunda camada de proteção CSRF.

## Por que `http-proxy-middleware` (a única dependência de runtime nova)

Fazer um reverse proxy correto à mão — lidando com todos os métodos HTTP,
streaming de corpo, chunked transfer-encoding — não é algo que valha a pena
reimplementar; é exatamente o problema que essa biblioteca resolve. É a
única exceção à preferência do projeto por lógica escrita à mão (ver
`common/rate-limit/rate-limiter.ts`, que É hand-rolled, por ser simples o
suficiente para valer a pena).

**Detalhe importante da v3 da biblioteca** (verificado contra a
documentação oficial, não assumido): ao contrário da v2, montar
`app.use('/api/v1/auth', proxy)` **não** inclui mais automaticamente
`/api/v1/auth` na requisição encaminhada — o prefixo de montagem precisa
estar dentro do próprio `target`. Por isso `proxy/proxy-routes.ts` monta
`target` como `` `${identityServiceUrl}/api/v1/auth` ``, não só
`identityServiceUrl` — do contrário, toda requisição proxied cairia com 404
silencioso no serviço de destino. Ver o comentário em
`proxy/create-service-proxy.ts` para o raciocínio completo.

## Por que `bodyParser: false` no `NestFactory.create`

O Nest liga seu próprio parser de corpo (JSON/urlencoded) globalmente
durante `NestFactory.create()`, antes de qualquer `app.use()` deste
`main.ts` rodar. Se deixado ligado, esse parser consome o stream cru do
corpo da requisição **antes** do `http-proxy-middleware` conseguir vê-lo —
todo `POST`/`PATCH` proxied (login, cadastro, aprovar/rejeitar/suspender
loja) chegaria ao serviço de destino com corpo vazio, silenciosamente. Este
gateway não tem nenhum `@Body()` próprio (não valida nada, só encaminha),
então o parser é desligado por completo e cada corpo passa como stream de
bytes intocado.

## Por que o rate limit é Express puro, não `@nestjs/throttler`

`@nestjs/throttler` é um `Guard` do Nest — só roda para requisições que
passam pelo pipeline de rotas do Nest. A maior parte do tráfego deste
gateway é `app.use()` puro (proxy), que roda **abaixo** desse pipeline e
nunca aciona um `Guard`. Por isso o limitador aqui
(`common/rate-limit/rate-limiter.ts`) é um middleware Express hand-rolled,
montado antes de qualquer proxy, e cobre literalmente tudo — proxied ou
não. Limitação conhecida e documentada: o estado é local ao processo; se
este gateway algum dia escalar para múltiplas instâncias sem um store
compartilhado (Redis, por exemplo), cada instância aplica seu próprio
limite independente.

## Stack

- Node.js 20+ / NestJS / TypeScript strict (só para `/health` e wiring —
  ver acima por que quase tudo roda como middleware Express puro)
- `http-proxy-middleware` 3.x

**Sem** Prisma, Supabase, banco de dados, Swagger, `@nestjs/throttler`,
`cookie-parser` (cookies só passam através, o gateway nunca precisa
parseá-los), `class-validator`/`class-transformer` (não há nenhum DTO).

## Execução local

```bash
npm install
cp .env.example .env
npm run start:dev
```

- Liveness: `GET http://localhost:8080/api/v1/health` — sempre `200`,
  nunca toca os serviços de destino.
- Readiness: `GET http://localhost:8080/api/v1/health/ready` — `200` só se
  identity-service, sellers-service, catalog-service **e** orders-service
  responderem `200` no `/health/ready` deles; `503` (`status: "degraded"`)
  caso algum esteja fora.

## Testes, lint e build

```bash
npm test
npm run lint
npm run build
```

Como nos outros dois serviços, **não executado neste ambiente** (sandbox
sem acesso a `registry.npmjs.org`) — revisado manualmente (balanceamento de
chaves/parênteses em todos os arquivos, resolução de imports relativos,
comportamento da v3 do `http-proxy-middleware` confirmado contra a
documentação oficial via busca na web, já que não dava para simplesmente
rodar `npm install` e testar). A suíte de testes cobre o que dá para testar
sem subir servidores HTTP reais: `RateLimiter` (lógica pura), as rotas do
`buildProxyRoutes` (tabela de roteamento), `blockInternalPaths`
(middleware), e `HealthService` (mockando `fetch`). O `createServiceProxy`
em si — o wrapper fino em cima da biblioteca — não tem teste próprio, pelo
mesmo motivo que `SellersServiceClient`/`IdentityServiceClient` nos outros
serviços não têm: é um wrapper fino sobre uma chamada de rede, e o valor
real de testá-lo exigiria subir servidores HTTP de verdade. **`npm install
&& npm test && npm run build` local, seguido de um teste manual de ponta a
ponta (login via `POST /api/v1/auth/login` através do gateway) é o próximo
passo obrigatório antes de qualquer deploy.**

## Variáveis de ambiente

Ver [`.env.example`](.env.example) — comentado variável a variável.

## Nota de entrega: a pasta antiga `potala-api-gateway`

Você já tinha uma pasta `potala-api-gateway` criada localmente (scaffold
`nest new` padrão, sem customização). Como você pediu para construir do
zero, este serviço foi entregue como `potala-api-gateway-v2`, numa pasta
separada, para não sobrescrever a antiga. Quando revisar e decidir seguir
com este, os passos são: apagar (ou renomear/guardar) a pasta
`potala-api-gateway` antiga, depois renomear `potala-api-gateway-v2` para
`potala-api-gateway`.

## Próximos passos sugeridos (fora do escopo deste serviço)

1. Quando `/admin/*` precisar de mais de um dono (catalog-service pode vir
   a precisar de rotas administrativas próprias), o modelo atual de "um
   prefixo → um serviço" para de ser suficiente ali e o roteamento de
   `/admin` precisa virar por recurso (`/admin/products` → catalog,
   `/admin/sellers` → sellers, etc.) — `/seller` já fez essa transição hoje
   (ver tabela acima); `/admin` ainda não precisou.
2. Centralizar a validação de sessão aqui (chamar
   `POST /internal/sessions/introspect` uma vez e repassar um header
   confiável) e trocar o `SessionAuthGuard` de cada serviço para confiar
   nesse header em vez de fazer a própria chamada — elimina a chamada de
   rede duplicada por requisição. Só faz sentido depois que o gateway
   estiver rodando em produção e esse custo for medido.
3. Frontend: trocar as chamadas diretas às portas 3001/3002/3003/3004 por
   chamadas a este gateway (porta 8080 por padrão), mantendo
   `credentials: 'include'` em todo fetch.
