# Migrations somente do marketplace

Pacote das 17 migrations de novembro. Pressupoe a base de setembro/outubro instalada; se o inventario indicar falta nessa base, conferir suas migrations anteriores antes de avancar. Um banco PostgreSQL com os schemas identity, sellers, catalog e orders. Instituto excluido. Nenhum banco foi alterado pelo empacotamento.

## Ordem segura

1. Confirmar projeto/banco Potala e backup recente. Nao usar o projeto Supabase de outra aplicacao.
2. Executar 00-preflight-somente-leitura.sql. Copiar o JSON e consultar os locais de historico indicados. Presenca de uma tabela nao comprova toda a migration.
3. Aplicar apenas arquivos realmente pendentes em cada pasta, pela ordem do nome. Cada arquivo ja tem BEGIN/COMMIT, timeout e SQL original. Nao incluir init, seeds, db push ou migrate reset. Se ocorrer erro, interromper e diagnosticar; nao tentar mascarar drift com IF NOT EXISTS.
4. Nao repetir automaticamente as tres migrations marcadas previouslyReportedApplied no manifesto: recuperacao/notificacoes Identity, atributos Catalog e politicas Catalog foram informadas como aplicadas. Conferir historico e estrutura mesmo nesses casos.
5. Para atividades: conferir catalog/20261110120000_activities, depois 20261110160000_activity_retry_files e 20261111120000_activity_details, somente as pendentes e respeitando dependencias. Executar 99-verificar-atividades.sql apos as alteracoes. API deve retornar 200; 503 DATABASE_SCHEMA_NOT_READY no novo codigo indica estrutura ainda incompleta, nao sucesso.
6. Conciliar execucao manual com historico Prisma antes de futuro migrate deploy. Nao registrar migrations como aplicadas sem verificar todos os objetos/checksum. Nao mover o historico nem fazer baseline automatico. Os nomes partner_legal se repetem em Catalog e Sellers, com conteudos diferentes: identificar por schema E nome.
7. Publicar codigo compativel e validar cada jornada com contas de teste autorizadas. Nao reverter apagando tabelas/dados novos; para retorno, preservar tabelas e usar imagem/frontend anteriores compativeis.

A indisponibilidade transitória 503 depende de logs do ambiente para causa definitiva. Este pacote nao altera infraestrutura, capacidade ou planos, nao inventa politicas juridicas e nao ativa gateway de pagamento.
