# Marketplace Potala em um Web Service

O gateway e os quatro serviços rodam em processos separados dentro da mesma imagem. O gateway escuta a porta pública PORT, e os serviços escutam loopback nas portas 3001–3004. Os clientes Prisma e as dependências pertencem a cada diretório de aplicação.

## Verificação local

Na raiz do repositório de implantação, Node 22:

```powershell
npm test
```

Depois de instalar dependências, gerar Prisma e compilar os cinco serviços, validar a configuração sem abrir conexões:

```powershell
node --env-file=.env.homolog deploy/render/start-services.mjs --check
```

O validador utiliza os validadores reais dos cinco builds. O arquivo privado de ambiente deve seguir `env.example`. Sem flag --check o comando inicia todos os serviços. A inicialização em um banco de homologação válido é uma etapa posterior à configuração.

## Docker

```powershell
docker build -f deploy/render/Dockerfile -t potala-marketplace:homolog .
docker run --rm --name potala-marketplace-homolog --env-file .env.homolog -p 10000:10000 potala-marketplace:homolog
```

Testar GET http://localhost:10000/api/v1/health e /api/v1/health/ready. Readiness deve responder 503 se qualquer serviço ou seu banco falhar, e 200 quando todos estiverem prontos. Os testes de domínio herdados precisam passar junto dos testes do supervisor. A imagem usa Linux e deve ser validada efetivamente antes de publicação.

O Dockerfile usa URLs fictícias somente para geração Prisma. Aplicar migrações, se necessárias, em uma etapa separada e auditada, após verificar os quatro históricos no banco. Não há seed ou migration automática no início da aplicação.

## Ensaio com PostgreSQL local

O teste opt-in `deploy/render/test/local-flow.mjs` aceita somente o banco descartável fixo `potala_homolog`, usuário `potala_test`, em 127.0.0.1:55432. Ele cria dados sintéticos novos, inicia os cinco processos, valida o launcher, executa cadastro/login/compra/estoque e encerra os processos. O pagamento é mock. O script se recusa a iniciar se as portas de aplicação estiverem ocupadas.

Para repetir, preparar um cluster local descartável nessa porta, criar esse banco e aplicar os históricos em ordem identity, sellers, catalog, orders. Para cada serviço, usar DATABASE_URL e DIRECT_URL `postgresql://potala_test@127.0.0.1:55432/potala_homolog?schema=DOMINIO`, executar `npm run prisma:generate`, `node node_modules/prisma/build/index.js migrate deploy` e `npm run build`. Gateway exige `npm ci` e `npm run build`. Nunca usar URLs reais nesse ensaio.

```powershell
$env:RUN_LOCAL_DB_SMOKE='1'
node deploy/render/test/local-flow.mjs
```

Na preparação de 06/11/2026 foi criado um cluster exclusivo em `artifacts/postgres` com os binários PostgreSQL 17 do computador. O cluster foi encerrado após a verificação. Para reutilizar esse mesmo cluster local, iniciar `pg_ctl` com esse diretório, bind 127.0.0.1 e porta 55432. Os logs locais de diagnóstico ficam em artifacts, ignorado pelo Git.

## Render

Publicar este repositório de implantação com os cinco diretórios completos. O manifesto sources.json identifica as versões de origem. Usar o blueprint render.yaml ou configurar manualmente runtime Docker, contexto raiz, Dockerfile deploy/render/Dockerfile e health check /api/v1/health/ready. Publicação automática está desabilitada.

Escolher plano e região após medir os cinco processos e os pools de conexão. A criação do serviço e seu custo precisam de definição do responsável pelo ambiente. Preencher segredos em runtime. A URL pública termina com /api/v1 na variável NEXT_PUBLIC_API_BASE_URL do frontend e exige novo build quando essa variável mudar.

O supervisor verifica os cinco builds e variáveis antes de iniciar qualquer filho, propaga SIGTERM e encerra o grupo se um filho sair. Há prazo de dez segundos antes do encerramento forçado. Tini coleta processos órfãos no contêiner. Revisar a janela de encerramento de cada integração durante homologação.

## Retorno

Seguir [ROLLBACK.md](ROLLBACK.md). A tag original-services-exact-20261106 e os bundles externos preservam o código inicial. A troca para produção depende do ensaio de retorno e do registro privado dos destinos originais.

## Limites do preparo

Esta mudança empacota o comportamento existente, incluindo pagamento mock. Banco de homologação, confirmação de cookies no domínio final, carga, memória e execução efetiva da imagem são gates de publicação. Atualizações de dependências identificadas pelos instaladores devem ser avaliadas em uma entrega própria com testes.
