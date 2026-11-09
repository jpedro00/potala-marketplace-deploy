# Execução — implantação conjunta Render

Plano: docs/superpowers/plans/2026-11-06-render-conjunto.md na pasta principal.

- Fontes preservadas em snapshots e bundles Git em migration-backups-20261106.
- Repositório de implantação isolado em potala-marketplace-deploy, branch migration/render-bundle.
- Tag original-services-exact-20261106 aponta para os cinco serviços antes de qualquer adaptação.
- Decisão: novo repositório de snapshots conforme plano, pois a pasta principal reúne repositórios independentes. Nenhum serviço de origem será editado.
- Docker indisponível no terminal. Build da imagem, rede Linux e homologação com PostgreSQL permanecem gates obrigatórios.
- Preparação local implementada e verificada. Nenhuma troca de tráfego realizada nesta etapa.
- RED observado nos testes novos de configuração/supervisor, depois 7 testes GREEN.
- Revisão independente identificou o IP compartilhado por proxy. Teste HTTP reproduziu a falha. Correção xfwd=false e headers normalizados passou.
- Ensaio PostgreSQL real identificou health do gateway sem prefixo. Alias compatível acrescentado. O fluxo real passou após correção.
- Cinco builds aprovados. Suites somam 1.067 testes, mais 7 do pacote. Lint apresenta 168 apontamentos de formatação, documentados em VALIDATION.md.
- SQL: conversão automática de finais de linha detectada no snapshot inicial. Recuperados bytes exatos dos commits de origem, protegidos por atributos Git e verificados nos 13 arquivos. Usar tag original-services-exact-20261106.
- Decisão: manter limpeza geral de formatação separada para concentrar revisão nas mudanças de implantação. Pendência explicitada, sem alegar aprovação de lint.
- Gates restantes: imagem Docker/Linux, ambiente Render, carga, domínio/frontend e ensaio operacional de retorno.

## Preparação Windows — 2026-11-06

- WSL 3.0.3 instalado; habilitação dos recursos concluída com exit 0. Windows exige reinicialização para aplicar os recursos.
- Docker Desktop 4.98.0 instalado por usuário com backend WSL 2, exit 0. Instalador oficial com SHA256 e assinatura Docker Inc. verificados.
- CLI confirmada: Docker 29.9.2. Engine e imagem Linux ainda não validados.
- Próxima etapa após reiniciar: iniciar Docker Desktop, verificar docker info, construir a imagem e executar homologação isolada. Não repetir as instalações.
- Nenhuma reinicialização automática, publicação no Render ou troca de tráfego realizada. Rollback continua na tag original-services-exact-20261106 e nos bundles.


## Validação Linux iniciada — 2026-11-06

- Reinicialização confirmada em 06/11/2026 13:13; WSL 2 executando docker-desktop.
- Docker Engine respondeu versão 29.9.2. Bloqueio de instalação resolvido.
- Build iniciado: docker build -f deploy/render/Dockerfile -t potala-marketplace:homolog .
- Primeiro download das camadas Node está muito lento. Log: artifacts/docker-build.log. Imagem e testes Linux ainda não aprovados.
- Download de postgres:17-bookworm iniciado para banco descartável. Nenhuma publicação ou mudança de tráfego.


- Ensaio Linux preparado em artifacts/run-linux-smoke.ps1; reutiliza local-flow.mjs sem alteração, com builds/dependências da imagem. Banco PostgreSQL descartável em container próprio, porta host 127.0.0.1:55433. Limpeza do banco e volume ao terminar.
- Worker artifacts/await-linux-smoke.ps1 iniciado (PID 21880): aguarda as duas imagens por até três horas e executa o ensaio. Resultado em artifacts/linux-smoke-status.json e logs linux-smoke-output.log / linux-smoke-error.log. Verificar estado antes de iniciar outro worker. Scripts com sintaxe PowerShell validada; execução Linux ainda pendente.

Em 06/11/2026 às 15h15, a imagem Linux e o ensaio com PostgreSQL 17 passaram. Resultado conferido em 09/11/2026 nos logs do build e do fluxo. Próxima fase: homologação pelo comando padrão do contêiner e no Render.
Em 09/11/2026, o comando padrão iniciou a imagem em modo de produção numa rede Docker isolada. Readiness HTTP 2xx, docker stop com código 0. Contêineres e rede de teste removidos. Próxima fase: homologação no Render.
