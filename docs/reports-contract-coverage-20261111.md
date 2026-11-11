# Cobertura dos relatórios — 11/11/2026

Implementação local aditiva: as dez visões existentes permanecem; vinte subvisões são organizadas em dez categorias principais no painel. Não representa homologação de produção ou aceite comercial.

| Categoria | Visões |
|---|---|
| Produtos e estoque | products, stock (quantidade, reservada e disponível por SKU) |
| Vendedores | vendors (nome comercial, situação e comissão; sem documentos/conta bancária) |
| Clientes | customers (ID, situação, verificação e data; sem nome/e-mail/endereço) |
| Cursos e eventos | activities, sessions, enrollments (tipo inclui recorrências) |
| Faturamento e comissões | sales, items |
| Pedidos | orders |
| Pagamentos, taxas e repasses | payments, refunds, payouts |
| Avaliações e favoritos | reviews, favorites |
| Cupons | coupons |
| Atendimentos | contacts, returns, claims, disputes |

## Interpretação financeira

`sales` preserva o snapshot por subpedido e acrescenta desconto, taxa do gateway e situação do pedido. `paidTurnoverCents` soma subtotal menos desconto mais frete somente quando o pedido está PAID/FULFILLING/COMPLETED; os demais têm zero. É a venda paga antes de deduzir estornos, não saldo contábil conciliado. Todos os valores financeiros estão em centavos.

`refunds` descreve solicitações com seu estado real (a implementação atual cria PREPARED). Não afirma que o provedor executou um estorno. `payouts` preserva o líquido previsto no snapshot, sempre com `payoutState=NOT_INTEGRATED` e `paidPayoutCents` vazio: nenhum repasse pago é fabricado. Ausência de integração permanece visível no painel e no arquivo.

## Fronteiras e filtros

Orders acessa somente seu Prisma. Catálogo/estoque/atividades/contatos, vendedores e clientes são lidos por POST interno autenticado com a chave já configurada de cada serviço; o gateway bloqueia `/internal`. Cada proprietário seleciona campos explicitamente, filtra por loja/período/situação antes de consultar e retorna até 500 registros com continuação por ID. Cursos/inscrições filtram a loja pela relação Activity. Agenda usa startsAt para o período; as demais visões usam createdAt (disputas usam openedAt).

A autorização administrativa ocorre em Orders antes de acessar a origem. Clientes, contatos, pedidos, transações, estornos, cupons, disputas e favoritos exigem GLOBAL. Visões por loja aceitam somente IDs concedidos. Concessões de mais de 100 lojas devem escolher uma loja por exportação para respeitar o limite do pedido interno; não são truncadas. CSV/XLSX protegem conteúdo que possa ser fórmula. O limite é 10.000 linhas por arquivo com erro explícito, exigindo filtros mais estreitos; não há arquivo parcial silencioso. Paginação concorrente não oferece snapshot entre serviços, portanto mudanças durante uma exportação podem aparecer conforme o instante de cada página.

Não foram adicionadas dependências, migrations de relatórios ou variáveis de ambiente. Os três AppModules proprietários precisam importar InternalReportsModule; Orders registra ReportsDomainClient no ReportsModule.

## Verificação local

- Orders: suites reports.service.spec.ts e reports-contract.spec.ts; autorização negativa, filtros, parâmetros estritos, CSV/fórmula, XLSX lido por ExcelJS, fluxo HTTP de download, limite e indisponibilidade da origem.
- Catalog: oito testes HTTP para as seis visões internas, autenticação, parâmetros limitados e continuação filtrada.
- Sellers e Identity: três testes HTTP cada, incluindo filtro de loja e seleção de clientes pelo papel CUSTOMER.
- Builds Orders/Sellers/Identity e TypeScript frontend aprovados. Catalog depende da geração Prisma dos novos campos de atividades/contato, coordenada na integração.

## Permissão adicional para relatórios financeiros

`sales`, `payments`, `refunds` e `payouts` exigem simultaneamente `reports:operational:export` e `reports:financial:export`, em concessões vigentes e não revogadas. O escopo efetivo é a interseção dos escopos autorizados para cada permissão. Uma permissão operacional GLOBAL não amplia uma financeira limitada a lojas; a situação inversa também não amplia o acesso. Escopos sem loja em comum são recusados. Payments/refunds exigem GLOBAL efetivo por não oferecerem recorte seguro por loja. Superadministrador autoritativo conserva seu acesso global. Demais visões operacionais mantêm sua permissão atual, inclusive preços e totais operacionais de pedidos/itens/cupons.
