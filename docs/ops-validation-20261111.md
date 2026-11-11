# Evidências operacionais e limites — 11/11/2026

Scripts de validação usam apenas bibliotecas nativas e dependências já instaladas. Executar na raiz do backend. Evidências completas ficam em `artifacts/ops-*`, ignoradas pelo Git. Nenhum teste modifica produção.

## Legado real e escopo

Fonte pública verificada: https://www.institutopotala.com/ (não presumir domínio `.com.br`). `robots.txt`, sitemap e sitemap de páginas responderam 200 em 11/11/2026. Inventário público reproduzível em `docs/ops-legacy-url-inventory-20261111.json`: 523 URLs distintas descobertas por sitemap/links e 30 páginas consultadas, com origem da descoberta, status, título e SHA-256 do documento. A coleta foi limitada; não representa auditoria exaustiva das 523 páginas. Não foram capturados dados de contas nem formulários enviados.

A página inicial, `/quemsomos`, `/contato` e a programação institucional permanecem fora da substituição pelo marketplace. Não redirecionar o domínio institucional inteiro. O legado `/cursos` contém textos reais; o novo `/cursos` é uma listagem de atividades. Existência da rota não demonstra que os cursos e conteúdos legados foram migrados. Páginas individuais exigem identificação do registro real equivalente e revisão editorial antes de aprovar destino. Nenhum novo 301 foi inventado: **0 correspondências aprovadas**, 30 páginas consultadas ainda sem destino aprovado. Os outros 493 endereços apenas descobertos também exigem revisão.

`legacy-redirects.json` do frontend foi preservado: `/loja/dashboard` → `/loja` é uma migração interna já existente, não prova migração das URLs institucionais. O probe verifica HTTP 301 e Location literal contra uma origem local; a validação também rejeita destinos externos, duplicados e cadeias. Nenhuma alteração a `next.config.ts` foi necessária.

```powershell
node deploy/validation/ops-legacy-inventory.mjs
$env:OPS_FRONTEND_URL='http://127.0.0.1:3000'
node deploy/validation/ops-redirect-probe.mjs
```

## Banco, backup e restauração

Docker não estava disponível (pipe `dockerDesktopLinuxEngine` ausente). Foi criado um cluster PostgreSQL 17 nativo separado em `artifacts/ops-postgres-20261111`, somente `127.0.0.1:55434`, usuário de teste `potala_test`, banco descartável `potala_completion`. O cluster anterior `artifacts/postgres` e a instância na porta 5432 não foram alterados. Autenticação trust se restringe a este cluster local descartável; não usar para produção.

As migrations Identity, Sellers, Catalog e Orders foram aplicadas nesse banco; Catalog inclui `20261111120000_activity_details` e `20261111130000_contact_submissions`. Logs: `artifacts/ops-{domínio}-migrate.log`.

```powershell
$env:OPS_ALLOW_DISPOSABLE_RESTORE='1'
node deploy/validation/ops-backup-restore.mjs
Remove-Item Env:OPS_ALLOW_DISPOSABLE_RESTORE
```

O script não aceita URL de restauração fornecida pelo operador: fixa loopback, porta, usuário e origem de teste; verifica impressão digital do servidor e diretório de dados exato `artifacts/ops-postgres-20261111` antes da criação. `createdb --template=template0` cria `ops_restore_TIMESTAMP` novo e falha se já existir. Não executa drop, clean ou overwrite. `pg_dump` em formato custom e `pg_restore --exit-on-error` são reais; o PostgreSQL valida as chaves estrangeiras na restauração. Compara contagem de todas as tabelas dos quatro schemas e definições/estado validado de todas as FKs nativas, registra SHA-256, tamanho e tempos. A origem deve estar quiescente durante a comparação. O banco restaurado é conservado para inspeção.

Esse ensaio local não comprova backup de produção nem integridade entre serviços onde IDs intencionalmente não têm FK nativa. Repetir com fixtures preenchidas após o smoke de integração para provar linhas de aplicação além das migrations.

## Carga pública local

```powershell
$env:OPS_BASE_URL='http://127.0.0.1:18080'
$env:OPS_USERS='1000'
$env:OPS_SECONDS='30'
$env:OPS_RAMP_SECONDS='10'
node deploy/validation/ops-load.mjs
```

Só aceita origem HTTP loopback. Executa GET alternado em `/api/v1/health/ready`, `/api/v1/public/products` e `/api/v1/activities`, com timeout de 5 s, rampa progressiva de dez segundos e um segundo de espera por usuário entre requisições. Limites: 1–1.000 usuários, duração 1–120 s. Registra respostas por status, erros reais, p50/p75/p95/p99, máximo, concorrência observada e pico RSS do **gerador**. Não confundir usuários simulados com requisições simultâneas. Respostas 429/5xx são falhas observadas e fazem o processo terminar com código 1. Não desabilitar rate limit para maquiar o resultado. O cenário público não valida transações autenticadas nem capacidade de produção; alvo e gerador compartilham computador.

## LCP em laboratório

```powershell
$env:OPS_FRONTEND_URL='http://127.0.0.1:3000'
$env:OPS_LCP_SAMPLES='5'
node deploy/validation/ops-lcp.mjs
```

Usa o Playwright instalado no frontend e Chrome instalado, sem instalar dependências. Mede `/`, `/catalogo`, `/cursos` em 1365×768 e 390×844, cinco contextos novos por combinação; coleta Largest Contentful Paint via PerformanceObserver. Registra versão do Chrome, LCP p75 por combinação e erros. São amostras de laboratório local, sem limitação artificial de CPU/rede, não p75 de usuários reais nem prova de duas versões de Chrome/Edge/Firefox/Safari. Executar com build de produção do frontend e gateway saudável apontando ao banco descartável para conteúdo representativo.

## MFA e rotação

```powershell
node deploy/validation/ops-security-metadata.mjs
node --test deploy/validation/ops.test.mjs
```

Inspeção local limita-se à presença dos arquivos e **nomes** de variáveis, sem imprimir valores. Não foram encontrados `.env` de serviço locais. O exemplo declara chaves internas e URLs dos bancos; isso não informa MFA nem se os segredos atuais foram revogados. **MFA de provedores não verificado; rotação não executada.** Exige metadados de conta e mudança coordenada em todos os clientes/serviços com evidência da revogação; checklist não serve como comprovação.


## Resultados executados no runtime isolado atual

Todos os ensaios usaram gateway `http://127.0.0.1:18080`, frontend com build de produção `http://127.0.0.1:3100`, cinco processos e o banco descartável. Foram executados em sequência: probe 301, LCP, backup/restauração com fixtures, cenário pequeno, cenário de 1.000 usuários. Não houve carga concorrente com a medição de LCP, alteração de limites nem acesso a produção.

**301:** `/loja/dashboard` respondeu 301 com `Location: /loja`, observado no servidor real. Uma correspondência interna existente verificada; zero novas correspondências institucionais aprovadas. Artefato: `artifacts/ops-redirect-probe.json`.

**Backup restaurado com linhas de aplicação:** em 11/11/2026, PostgreSQL 17.11, `potala_completion` → banco novo `ops_restore_1794404864488`. 157.322 bytes, SHA-256 `7ecaaf286d81ea3b4821740850714d59c0414441e8bb1c1e17c053729f6b6d8e`. Dump **812,30 ms**; restauração **1.652,02 ms**. **53 tabelas e 43 FKs nativas** com contagens e definições iguais; todas as FKs validadas pelo PostgreSQL durante a restauração. Exemplos restaurados: quatro usuários, dois vendedores, dois produtos e variantes/estoques, um pedido com dois subpedidos e dois itens, uma atividade com sessão/material/inscrição, um contato e uma ação de contato. O guarda adicional verificou o diretório de dados real do cluster antes de criar o alvo. Isso comprova o ensaio local com fixtures; não é backup de produção. Prova integral: `artifacts/ops-backup-latest.json`; dump e prova retidos em `artifacts/ops-backup-1794404864488/`.

**LCP laboratorial:** Chrome **157.0.8103.50**, cinco contextos novos por combinação, 30/30 amostras com status 200 e LCP registrado. Sem throttling de CPU/rede, hardware compartilhado, somente Chrome instalado e páginas públicas; não representa p75 de campo nem matriz completa contratual de navegadores.

| Página | Desktop 1365×768 p75 | Mobile 390×844 p75 | Amostras por perfil |
|---|---:|---:|---:|
| `/` | 960 ms | 556 ms | 5 |
| `/catalogo` | 776 ms | 296 ms | 5 |
| `/cursos` | 412 ms | 632 ms | 5 |

Os seis perfis de laboratório ficaram abaixo de 3.000 ms. Evidência com cada amostra e condições: `artifacts/ops-lcp.json`.

**Carga:** mesmas três URLs públicas válidas listadas acima, GET, espera de 1.000 ms por usuário, sem credenciais, alterações de configuração ou aumento de rate limits. Todos os usuários simulados saíram de **um único gerador/um IP loopback**. O gateway usa `req.ip` como chave de um orçamento global entre rotas (defaults de **300 requisições/60 s**); os serviços também aplicam throttling por rota, com default de 60/60 s nas leituras comuns. Não houve distribuição de origem por 1.000 IPs nem 1.000 sessões autenticadas. Máquina: 12 CPUs lógicas, 8.259.321.856 bytes de RAM total, Node v22.22.0. Gerador e aplicação compartilham recursos.

| Cenário | Rampa/duração alvo | Requisições | HTTP 200 | HTTP 429 | HTTP 503 | Pico de requisições em voo | p95 / p99 de todas as respostas |
|---|---|---:|---:|---:|---:|---:|---|
| 5 usuários simulados | 2 s / 10 s | 48 | 48 | 0 | 0 | 1 | 28,40 / 31,82 ms |
| 1.000 usuários simulados | 10 s / 30 s | 25.192 | 169 | 24.979 | 44 | 126 | 11,85 / 27,53 ms |

O cenário pequeno passou (código 0, sem erros de rede). O cenário de 1.000 **falhou** (código 1): predominam 429 e houve 44 respostas 503, todas em `/api/v1/health/ready`. O ensaio de um IP não comprovou suporte a 1.000 usuários distribuídos e tampouco demonstra incapacidade definitiva de atender 1.000 IPs distintos/conexões; ele encontrou o orçamento por IP configurado. Número de usuários simulados não equivale a 1.000 requisições simultâneas. A latência agregada baixa é dominada por rejeições rápidas e não demonstra desempenho de operações bem-sucedidas. Não foram coletadas latências separadas por status. Todos os status por URL estão em `artifacts/ops-load-1000-users.json`; cenário pequeno em `artifacts/ops-load-5-users.json`.

No ensaio de 1.000: duração real 30.941,10 ms; máximo de resposta 106,63 ms; zero erros de rede do gerador; pico RSS do gerador **173.600.768 bytes**. RAM livre do computador variou de 548.106.240 para 358.227.968 bytes. Esses valores medem o gerador e a máquina compartilhada, não o RSS dos serviços.

**Recuperação observada:** às 13:50:29 UTC, sem reiniciar serviços nem alterar limites, gateway e quatro serviços responderam 200 em readiness, todos os bancos e upstreams `up`. Registro: `artifacts/ops-post-load-readiness.json`. Nova verificação às **13:52:32 UTC**, mais de 60 s após o fim da carga, confirmou novamente 200 no gateway e quatro serviços, bancos e upstreams `up`, em `artifacts/ops-post-load-readiness-after60s.json`. A implementação do gateway transforma qualquer probe upstream não-2xx em `down`/503; readiness dos domínios passa pelos throttlers, de modo que um 429 upstream também produz readiness 503 no gateway. Os contadores são compatíveis com esse mecanismo, mas não registraram o corpo/status específico de cada upstream durante os 44 casos: a causa individual não foi determinada. Não afirmar queda de banco com base nesse dado. Não foram incluídos logs correlacionados dos upstreams durante a carga nesta evidência.

Testes dos guardas loopback/percentis: `node --test deploy/validation/ops.test.mjs`, **2/2 aprovados**. Todos os scripts passaram em `node --check`. MFA e rotação continuam não comprovados/não executados por indisponibilidade de acesso aos provedores; não foram solicitadas novas conexões.



## Prova final de conteúdo restaurado

Além das contagens e FKs, o script agora compara SHA-256 de todas as linhas de cada tabela, serializadas como JSONb e ordenadas com COLLATE C, timezone UTC e encoding UTF-8; duplicatas são preservadas. A agregação é limitada a banco descartável pequeno (100 mil linhas e 10 MiB JSON por tabela, 100 MiB no conjunto), com timeout explícito. Não é ferramenta de backup escalável para produção. Nenhum valor de registro é impresso.

Última execução final: `ops_restore_1794418506801`, backup de 162.627 bytes, SHA-256 `687f9a8a5320067c5346b861300b8281643ae675fa628106273761fb87833232`, dump 640,47 ms, restauração 1.050,98 ms. Igualdade de 53 hashes, contagens e 43 FKs validada. Artefatos em `artifacts/ops-backup-latest.json` e na pasta indicada nele.
