# Administração, concessões e exportações — 10/11/2026

## Migração operacional obrigatória antes da publicação

Esta alteração é aditiva e NÃO concede poderes a administradores legados automaticamente. A coluna identity.perfis_administrador.super_admin nasce false para todos. O seed existente cria ADMIN sem superpoderes e não foi alterado para escalar contas existentes. Sem grants ou bootstrap explícito, endpoints administrativos retornam 403. As sessões de cliente/vendedor continuam sujeitas a ownership normal.

1. Validar backup/restauração e aplicar todas as migrations em banco descartável. Conferir em especial 20261110000100_admin_access do Identity.
2. Antes da implantação da versão que impõe grants, escolher explicitamente um administrador ACTIVE existente, cujo vínculo ADMIN e AdminProfile já existam; registrar operador e ticket de mudança.
3. No diretório potala-identity-service, apontando exclusivamente para o ambiente autorizado, executar `npx ts-node prisma/bootstrap-access.ts <UUID-do-administrador> CONFIRM_SUPERADMIN`. O script valida status, papel e perfil numa transação e só muda super_admin da conta especificada. Não promove compradores/vendedores, não usa e-mail como seleção, não é chamado pelo aplicativo nem pelo seed. Desenvolvimento desta entrega NÃO executou o script em produção.
4. Validar login e criar até cinco perfis pelo painel `/admin/administradores/perfis`; conceder somente permissões necessárias e lojas necessárias. Testar uma concessão GLOBAL e uma SELLERS com duas lojas, e revogar uma concessão. Não usar uma flag no cliente para autorizar.
5. Promover a aplicação apenas após provar uma conta administrativa operacional e os testes negativos. Para retirar bootstrap, usar procedimento operacional autenticado de banco para definir super_admin=false na conta específica, mantendo outro superadmin explicitamente autorizado. Registrar a mudança. Rollback da aplicação não exige apagar tabelas/colunas; não executar down migration destrutiva.

## Contrato de autorização

A introspecção interna de sessão retorna `isSuperAdmin` e `grants` atuais do Identity. Cada grant contém grantId, roleKey (slot do perfil), permissions, scope `{type:GLOBAL|SELLERS,sellerIds:UUID[]}` e expiresAt. Não se combinam permissão de um grant com escopo de outro. Revogação, expiração, mudança do perfil e bloqueio passam a valer na próxima requisição autenticada, sem depender de logout/cache do navegador. Os quatro domínios impõem RolesGuard global; RequirePermission usa códigos `domínio:recurso:ação`. Falta de claims, grants inválidos, grants expirados/revogados e rotas sem metadados não concedem acesso. Rotas sem metadados/pending exigem superadmin explícito.

Escopos não implementados por uma consulta são recusados, não elevados a GLOBAL: listagens administrativas antigas de múltiplas lojas e IDs de recursos cujo seller precisa ser resolvido são GLOBAL por enquanto; mudanças no próprio seller com sellerId no path podem usar SELLERS. A exportação prova seu filtro no servidor e habilita COLLECTION filtrada apenas em seu controller. OWN_STORE não é emitido pelo novo gerenciador.

Os logs `permission_enforced` registram decisão aceita/negada, nome técnico do handler, motivo e hash truncado do userId. Não registram e-mail, nome, cookie, token, corpo, query, IDs de loja ou dados financeiros. O log demonstra a autorização da requisição, não substitui ticket operacional nem afirma que toda operação aceita concluiu com sucesso.

## API de gestão (Identity)

Somente superadmin, com sessão e OriginGuard:
- GET `/admin/access`: catálogo de códigos, cinco slots e até mil concessões não revogadas para gestão.
- PUT `/admin/access/roles/:slot`: nome e array de permissions do catálogo. Slot 1..5, CHECK e UNIQUE no PostgreSQL, upsert evita corrida de contagem. Editar perfil altera todas as suas concessões na requisição seguinte.
- POST `/admin/access/grants`: userId ADMIN ACTIVE, roleId existente, scopeType GLOBAL/SELLERS, sellerIds e expiresAt opcional futuro. GLOBAL exige lista vazia; SELLERS exige 1..100 UUIDs.
- DELETE `/admin/access/grants/:id`: revogação lógica com timestamp.

O gerenciador configura perfis; criação de administradores continua no fluxo existente e não cria grants silenciosamente.

## Relatórios (Orders)

GET `/admin/reports` lista dez visões sobre os modelos reais do próprio domínio. GET `/admin/reports/:view/export?format=csv|xlsx&from=<ISO8601>&to=<ISO8601>&sellerId=<UUID>&status=<ENUM>` exporta o conjunto filtrado integral, independente da página exibida na UI. Exige `reports:operational:export` (ou superadmin). Não há consulta cross-schema.

Visões: sales (SellerOrder), orders, items, payments, reviews, coupons, returns, claims, disputes e favorites. Sales/items/reviews/returns/claims aceitam SELLERS e impõem interseção em WHERE; pedidos globais/transações/cupons/disputas/favoritos exigem GLOBAL, para não expor totais ou dados de outra loja. Campos são allowlist de snapshots/IDs/status/contagens/valores; não exportam endereços, e-mails, documentos, hashes, sessões, providerRef ou chaves. Valores financeiros são centavos. Date range filtra createdAt, ou openedAt em disputas, ou createdAt de SellerOrder em itens. Status precisa pertencer ao enum da visão; cupons usam enabled e não aceitam filtro status inexistente.

Limite explícito 10.000 linhas: a consulta pede 10.001 e responde 400 se exceder; nunca produz arquivo silenciosamente truncado. Refinar período/loja. Resposta no-store. CSV usa UTF-8 BOM, aspas e escaping; strings iniciadas (inclusive após espaço/tab/controle) por =,+,-,@ recebem apóstrofo. XLSX usa ExcelJS e células literais, sem fórmulas. O frontend baixa Blob autenticado e mostra erros do servidor. Não existe relatório de estoque/vendedores/clientes nesta lista porque esses dados pertencem a outros domínios; as dez visões não inventam esses dados.

## Evidências e limites

Testes focados em ReportsService: campos existentes no Prisma, filtragem de loja no banco, tentativa de outra loja, negação GLOBAL, limite 10.001, claims revogadas/expiradas/legadas, escaping CSV e XLSX real com 150 linhas (além de uma página UI). Testes de guard em cada domínio: legado negado, bootstrap explícito aceito, grant atual aceito/revogado negado, collection sem filtro negada. Identity testa introspecção com grants ativos/revogados/expirados. Builds/tests finais e banco descartável são registrados na validação de integração.

Biblioteca ExcelJS 4.4.0 fixada em Orders; dependências transitivas/audit residual são acompanhadas na revisão de segurança da entrega. A gestão lista até mil concessões para proteger resposta; bases administrativas maiores exigem paginação de gestão em evolução futura. O export não possui processamento assíncrono para conjuntos acima de 10 mil registros: pede refinar o filtro.

## Complemento da revisao

A migration Identity `20261110000200_access_audit` persiste auditoria administrativa no mesmo commit transacional da alteracao: actorUserId tecnico, acao controlada ROLE_UPSERT/GRANT_CREATE/GRANT_REVOKE e targetId tecnico. Nao copia nome de perfil, nome de usuario, e-mail, permissoes, cookies nem dados financeiros. Falha ao gravar auditoria reverte a mudanca. Bootstrap CLI registra SUPERADMIN_BOOTSTRAP com ator nulo (operador externo e ticket registrados pelo procedimento operacional), sem inventar uma identidade de operador. As decisoes negadas/aceitas do guard permanecem nos logs pseudonimizados descritos acima.

O catalogo de permissoes agora tem versao 2026-11-10.1, 56 codigos, incluindo atividades/inscricoes e conteudos. Suites antigas de modo sombra foram atualizadas para o enforcement atual: flag de sombra nunca devolve acesso legado, expirado, sem grant ou colecao sem filtro. Um superadmin explicito e grant GLOBAL valido preservam a resposta autorizada e o observador opcional.

Provas locais: Identity build e 23 testes de guard/sessao/autorizacao aprovados; Orders 27 testes de relatorios/guard/cobertura/autorizacao aprovados; Sellers 13 e Catalog 10 testes focados aprovados. Migration Identity inicial+acessos aplicada ao PostgreSQL descartavel em 127.0.0.1:55434/potala_completion; prova SQL mostrou super_admin false por padrao, gravacao transacional de role/grant com rollback e rejeicao do sexto slot pelo CHECK. Nunca foram usados bancos publicados. Auditoria persistente possui testes adicionais RED (4 falhas observadas antes da implementacao) e GREEN registrado na integracao.
