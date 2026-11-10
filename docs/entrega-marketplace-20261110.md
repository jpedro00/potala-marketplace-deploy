# Estado da implementação — 10/11/2026

Branch dos dois repositórios: `feature/marketplace-completion-20261110`. Alterações locais; não publicadas e não aplicadas ao banco de produção. Repositórios originais dos microserviços preservados. Instituto fora do pacote.

| Pedido | Entrega local | Dependência para encerrar em produção |
|---|---|---|
| CSV/XLSX | Dez visões com filtros no servidor, autorização, limitação explícita e proteção contra fórmula | Migrar, configurar perfis e validar os períodos e colunas com a operação |
| Permissões | Cinco perfis, concessões por lojas/global, validade, revogação e auditoria transacional | Bootstrap explícito de superadministrador existente e atribuição dos perfis |
| Pagamentos | Preferências de vendedor, política versionada, taxa/comissão/split em centavos, chave idempotente, estorno preparado, pagamento de inscrições e reconciliação de callback | Gateway real, onboarding/recebedores, credenciais, webhook assinado, Pix/cartão, split e estorno efetivos, conciliação e homologação |
| Cursos e jornadas | Cursos/eventos/recorrência, sessões, vagas, reservas, retomada após expiração, inscrição, agenda, materiais binários e downloads com autorização | Cadastrar conteúdo e validar as regras comerciais reais; cursos pagos pelo cadastro da loja responsável |
| Analytics | Consentimento, eventos do funil, compra confirmada somente no servidor, deduplicação, retirada e retenção | Aprovar política/textos e validar métricas com a operação; não é implantação GA4/GTM/Brevo |
| 301 | Registro validado de caminhos locais sem cadeias/loops e alias real `/loja/dashboard` → `/loja` com HTTP 301 | Inventário aprovado das URLs antigas; nenhuma URL histórica foi inventada |
| Manuais/treinamento | Manuais de cliente, vendedor, administrador, implantação/retorno e roteiro de quatro horas | Sessão com participantes, registro e gravação ainda não realizados |
| Produtos | Fallback visual previamente implementado e checklist operacional | Revisar dados reais identificados na auditoria anterior; consulta pública atual sofreu timeout, portanto não houve saneamento no banco publicado |

## Evidências locais

- Identity: 112 testes; Sellers: 112; Orders: 613; Catalog: 255; Gateway: 75. Total das suites: 1.167 testes aprovados. Catalog inclui prova PostgreSQL de concorrência de vagas, expiração, downloads e retirada de analytics. Os oito testes do supervisor/configuração também passaram.
- Compilação dos cinco serviços e frontend; checagem TypeScript do frontend aprovadas. Prisma Client gerado e todas as migrations aplicadas apenas em PostgreSQL descartável `127.0.0.1:55434/potala_completion`.
- `deploy/render/test/completion-flow.mjs`: execução real dos cinco processos, login/logout, duas lojas/produtos, checkout mock com rateio reconciliado e retry, estoque uma vez, isolamento entre lojas, bloqueio de rotas internas, exportações CSV e XLSX (arquivo aberto por ExcelJS), curso/inscrição/material, analytics e rejeição de compra forjada pelo cliente.
- Navegador Chrome local: HTTP 301, ausência de eventos antes do consentimento, coleta permitida, solicitação de retirada e ausência de nova coleta após recusa. Telemetria interceptada no teste, sem escrever analytics em produção.
- `artifacts/security-audit-*-final.json`: auditoria npm das dependências de produção com zero vulnerabilidades conhecidas nos seis pacotes. Atualização Next 16.4.6, dependências compatíveis Nest/Prisma e overrides pontuais deepmerge-ts 8.0.2 e UUID 11.1.1; geração Prisma e exportação XLSX verificadas após a atualização. Não significa inexistência de vulnerabilidades ou pentest externo completo.
- Corrigido bypass de verificação de origem por query contendo `/internal/`, com regressão nos três serviços afetados. Autorizações administrativas deixam de operar apenas em modo observador: permissões são efetivamente exigidas pelo backend.

Logs em `artifacts/completion-*` e `artifacts/security-*` são evidências locais ignoradas pelo Git e podem conter identificadores de fixtures descartáveis. Nunca publicar logs operacionais ou credenciais sem revisar.

## Riscos e limites restantes

Não houve teste de 1.000 usuários, prova de LCP p75 contratual, teste de recuperação real de produção, garantia de SLA, rotação das credenciais previamente expostas ou homologação financeira externa. Não declarar conformidade integral do anexo com base nestes testes. Migrations e ativação de permissões exigem a sequência do manual para não bloquear administradores antigos. Pagamento real permanece bloqueado por padrão; simulação exige simultaneamente ambiente `test` e modo `mock`.

Materiais passam por validação de formato/tamanho, entrega como anexo e autorização a cada download; não há antivírus/CDR completo. O inventário de URLs legadas, revisão editorial dos produtos, regras comerciais aprovadas e treinamento ministrado seguem separados da entrega técnica.

Produtos apontados pela evidência de 09/11: imagem de Cristais vinculada a página HTML e produto público com título `TESTE REGRESSAO Produto Seller B 1663039609`. Confirmar o estado atual no painel; substituir por imagem direta confiável e desativar a fixture quando confirmado que é teste. Não foram excluídos produtos nem alterados pedidos reais.

Próximo passo operacional: homologação assistida dos perfis, telas e regras; depois backup/restauração testados, migrations e bootstrap, publicação backend/frontend e smoke em produção. Retorno documentado por commit, sem apagar as tabelas novas.
