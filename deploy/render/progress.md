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
