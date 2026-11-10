# Preparação financeira — 10/11/2026

Esta entrega não integra um gateway real, não cobra, não transfere e não executa estornos. A aplicação usa adaptador indisponível por padrão, inclusive se `PAYMENT_GATEWAY_MODE=mock` for colocado em produção. Simulação exige simultaneamente `NODE_ENV=test` e `PAYMENT_GATEWAY_MODE=mock`.

## Política comercial

`GET/POST /api/v1/admin/finance/policies` exigem ADMIN e permissões GLOBAL `finance:commission:read`/`finance:commission:manage`. POST recebe `{scope: PLATFORM|SELLER|CATEGORY|PRODUCT, scopeId?: UUID, commissionBps: inteiro 0..10000, gatewayFeeBps: inteiro 0..10000, fixedFeeCents: inteiro >=0}`. ScopeId é obrigatório fora de PLATFORM. Cada gravação cria uma versão imutável, identifica o administrador e preserva as anteriores. Alterações/exclusões diretas são recusadas pelo banco.

Precedência explícita: PRODUCT > CATEGORY > SELLER > PLATFORM, sempre a versão mais recente do escopo selecionado. A ausência de política recusa checkout. Não há percentuais ou taxas comerciais aprovados automaticamente. A antiga comissão cadastral de Sellers permanece informativa; não substitui uma política financeira completa.

Dinheiro é inteiro em centavos; percentuais, pontos-base (100 bps = 1%). Comissão e taxa percentual incidem sobre o valor após desconto e arredondam meio centavo para cima, com BigInt. A taxa fixa é **por linha do pedido**, declarada no formulário e no snapshot (`fixedFeeBasis=PER_ORDER_LINE`). O desconto global é rateado proporcionalmente entre lojas e linhas pelo maior resto, com desempate na ordem de entrada. A soma de líquido + comissão + taxas é exatamente o valor a cobrar. Se taxas deixarem o líquido negativo, a cotação é recusada. Não há frete calculado nesta entrega.

Cada SellerOrder registra desconto, comissão, taxa, líquido e snapshot de todas as linhas com o ID da versão, bases e taxas usadas. Mudanças de política não recalculam pedidos existentes. Pedidos legados sem snapshot exibem traço nos novos campos financeiros; não se inventa histórico nem repasse.

## Recebimentos do parceiro

`GET/PATCH /api/v1/seller/settings/payments` exigem usuário SELLER, vínculo resolvido no servidor e papel OWNER. PATCH permite somente `{acceptPix?: boolean, acceptCard?: boolean, payoutSchedule?: MANUAL|WEEKLY|MONTHLY}`. Valores iniciais dos meios são false; não significam autorização de cobrança. Alterações são auditadas com ator, loja e revisão.

O cadastro proprietário da loja (`PATCH /seller/settings`) também exige OWNER. MANAGER e STAFF recebem 403. Nenhum endpoint do navegador aceita PAN, CVV, chave Pix, agência/conta completas, tokens ou credenciais do gateway. A tabela de recebimento tem somente referência de recebedor/provedor e metadados bancários mascarados; o GET público ao proprietário não retorna a referência interna. O futuro adaptador deverá conduzir onboarding/KYC diretamente no provedor e preencher referências no servidor. Ainda não há onboarding funcional nem rotina de repasse.

Orders obtém aceitação de meio, status e referência somente pelo endpoint interno Sellers `GET /internal/sellers/:sellerId/payment-settings`, protegido pela chave entre serviços. Uma loja inativa ou que não aceita o meio recusa a compra. O gateway não expõe rotas internas ao navegador.

## Checkout, inscrições e repetição

Checkout aceita opcionalmente `paymentMethod: PIX|CARD` (PIX quando omitido), `analyticsConsent` e `analyticsSessionId`. O frontend mantém a mesma Idempotency-Key para retries do mesmo formulário. O servidor mantém idempotência cliente/chave e detecta mudança de itens/endereço/cupom/meio na mesma chave. Cada chamada ao provedor recebe chave persistida e estável por pedido. **Um adaptador real deverá garantir idempotência dessa chave em todas as instâncias e após reinicialização, suportar o split integral e verificar a assinatura de webhooks; nunca poderá ignorar o split.**

`POST /api/v1/me/activity-payments` recebe apenas `{enrollmentId, paymentMethod?, analyticsConsent?, analyticsSessionId?}`. A sessão identifica o comprador; preço, vendedor, status e reserva vêm de Catalog `GET /internal/activities/enrollments/:id`. Pedidos de outro usuário dão 404; reserva vencida, gratuita ou sem vendedor recebedor não é cobrada. Atividades próprias da plataforma com sellerId nulo precisam de uma futura política explícita de recebedor da plataforma.

Order, SellerOrder e PaymentTransaction de inscrição são gravados na mesma transação, com enrollmentId único. Uma interrupção antes de charge pode retomar o mesmo pagamento/chave. O meio e os valores são lidos do snapshot persistido. Pagamento PENDING com referência do provedor aguarda webhook. A aprovação chama no servidor Catalog `POST /internal/activities/enrollments/:id/payment` com `{orderId,userId,amountCents,status:CONFIRMED}`; o cliente jamais fornece status/valor. Reentrega aprovada retenta o callback idempotente sem repetir a baixa de estoque.

Se o provedor confirmar após expirar/cancelar a vaga, Catalog recusa acesso e Orders preserva o fato financeiro aprovado. Qualquer falha desse callback grava um evento deduplicado `PAYMENT_RECONCILIATION_REQUIRED` na outbox (payload mínimo com motivo/inscrição) e propaga a falha para permitir retry. Não há trabalhador de reconciliação ou compensação automática: a equipe deve comparar inscrição/pagamento e, se necessário, preparar estorno. O evento histórico pode continuar pendente mesmo após sucesso posterior; confirme o estado em Catalog antes de atuar. Uma cobrança aprovada nunca é transformada em cancelamento fictício para ocultar inconsistência.

Analytics só recebe sessão quando `analyticsConsent === true` foi registrado no pedido. Callback `POST /internal/analytics/purchases` leva somente orderId, sessionId e valueCents. Falha de telemetria é registrada e nunca impede pagamento/inscrição. Não há garantia de entrega da telemetria durante uma indisponibilidade prolongada.

## Preparação de estorno

`POST /api/v1/admin/finance/payments/:id/refund-preparations` exige `finance:refund:execute` GLOBAL e recebe `{amountCents: inteiro positivo, idempotencyKey: string de16..128 caracteres alfanuméricos/hífen/underscore}`. Só pagamentos APPROVED podem gerar preparação. O limite é valor pago menos preparações não canceladas. A transação SERIALIZABLE e a chave única impedem sobre-estorno concorrente; conflito pede retry com a mesma chave. A resposta PREPARED é uma reserva operacional; **nenhum dinheiro é devolvido**. Não há transição artificial para EXECUTED. Execução real também precisará de callback REVOKED à inscrição, idempotência do provedor e compensação do split.

## Provas e limites

- Prisma generate e Nest build de Orders/Sellers passaram.
- Migrations Orders (10) e Sellers (2) aplicadas somente em `potala_completion`, PostgreSQL local descartável na porta 55434.
- Suites Orders `financial-split`, `finance.service`, `activity-payment-effects`, `mock-payment-gateway.adapter`, checkout/idempotência passaram. Sellers `payment-settings` e `sellers.service` passaram.
- `FINANCE_TEST_DATABASE_URL=postgresql://potala_test@127.0.0.1:55434/potala_completion?schema=orders node prisma/verify-finance.cjs` prova versões imutáveis/CHECK, reconciliação, estornos concorrentes, replay e retomada de pagamento de inscrição após interrupção antes do gateway. O script valida host/porta/banco, não lê .env, cria somente dados descartáveis e usa mock local explicitamente no teste de aprovação.
- A suite completa de Orders inicialmente encontrou testes antigos do modo sombra que esperavam 200 e catálogo de50permissões; a frente de permissões está atualizando os testes para o enforcement atual. Não é prova de execução financeira real.
- Persistem os limites existentes do checkout de produtos quanto à compensação de estoque após crash/falha entre serviços. Adaptador real, KYC, tarifas comerciais aprovadas, webhook real, liquidação, refund real, compensações e reconciliação operacional são pré-condições para habilitar produção financeira.
