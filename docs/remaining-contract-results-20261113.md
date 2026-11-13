# Complementos do marketplace — 13/11/2026

Estado: implementação na branch `feature/marketplace-completion-20261110`, validada localmente. Não é uma declaração de publicação ou aceite integral do contrato. Gateway financeiro excluído por orientação do usuário; Instituto fora desta etapa. Medição própria mantida e tags externas desativadas.

## Implementado nesta etapa

| Área do Anexo I | Entrega | Limite de aceite |
|---|---|---|
| Contas | Recuperação de senha, confirmação de e-mail, tokens com hash/validade/consumo único, revogação de sessões e proteção contra login concorrente com senha antiga | Ativação e entrega real de e-mail dependem do remetente Brevo aprovado; confirmação obrigatória é opt-in |
| Notificações | Caixa interna por usuário, 20 modelos, fila de e-mail criptografada, workers de pedidos e parceiros com idempotência/retry | Modelos disponíveis não significam todos os eventos conectados. Retornos, reembolsos, avaliações, suporte e inscrições ainda precisam de cobertura automática completa; envio real não homologado |
| Frete | Configuração explícita por loja, retirada/endereço, tabela por UF/intervalo de CEP, cotação autoritativa, snapshot no pedido e cupom de frete | Transportadora externa ainda não integrada/homologada. Nenhum frete gratuito é presumido sem configuração |
| Fiscal | Anexos privados PDF/XML por subpedido, download do comprador e administrador autorizado, revogação/auditoria, limite de tamanho e XML estrito sem DTD | Armazenamento não emite nem autentica NF-e; não substitui integração fiscal |
| Parceiros | Até dez tipos de documentos, envio privado, análise, correção, reenvio, histórico e bloqueio de aprovação sem documentos/solicitação quando exigidos | Tipos/documentos reais devem ser configurados pela organização |
| Políticas | Rascunho, publicação/revogação, versões/hash, aceite imutável associado ao usuário e adesão exigida no envio do cadastro do parceiro | Textos aprovados não foram inventados. Aceite obrigatório de compra/cadastro de cliente ainda não está conectado de ponta a ponta |
| Produtos | Até dez atributos tipados por tipo, controles de administrador/vendedor, edição de título/descrição/preço/imagens e filtros públicos | Classificação DIGITAL/SERVICE não implementa sozinha entrega de arquivos ou agendamento de serviços; revisão editorial de produção permanece pendente |
| Saúde operacional | Readiness agrega chamadas concorrentes e usa cache de um segundo; probes dos domínios fora do limite de requisições de negócio | Não comprova mil usuários simultâneos, SLA ou capacidade do plano contratado |

## Provas executadas nesta retomada

- Builds dos quatro serviços, gateway e frontend de produção concluídos; TypeScript do frontend aprovado.
- Identity: 117 testes na suíte completa e seis provas adicionais com PostgreSQL isolado, todas aprovadas.
- Sellers: 124 testes aprovados. Script real PostgreSQL/HTTP de documentos e políticas aprovado: oito aceites concorrentes, versões/revogação, imutabilidade, IDOR, correção/reenvio, limite dez tipos e retry de notificações.
- Catalog: 286 testes aprovados; outros 19 condicionais não executados nessa suíte. A prova isolada de atributos executou três casos com sucesso (um já pertence à suíte comum), incluindo limite concorrente e propriedade.
- Orders: 39 suítes, 673 testes aprovados com provas PostgreSQL habilitadas: frete/cupom/rateio, anexos privados/XML, lease/retry de notificações e matriz de permissões fiscais. A primeira execução detectou três faltas na matriz de testes; corrigidas antes da execução final.
- Gateway: 76 testes aprovados. Supervisor/configuração: nove testes aprovados, incluindo isolamento das credenciais de e-mail e flags dos workers.
- Teste HTTP integrado executou os cinco processos reais: autenticação, duas lojas, checkout exclusivamente simulado, replay idempotente, estoque, atributos/filtros, anexo fiscal privado com negação a outra loja, notificação chegando ao comprador, relatórios CSV/XLSX, curso/inscrição/material, contato/analytics e bloqueio de rotas internas.
- Chrome local: política não publicada, renderização segura de texto, aceite da versão, remoção do token do fragmento e envio do reset aprovados com fixtures HTTP. Regressão dos dois editores de atividades aprovada.
- Lint dos arquivos novos e demais arquivos alterados aprovado após corrigir o efeito do editor legal. Cinco arquivos legados alterados apenas para integração continuam com diagnósticos de `react-hooks/set-state-in-effect` nos carregamentos já existentes (detalhe de pedido do cliente, CouponsView, OrdersView, SellerOrderDetailView e SellerProductDetailView); não foram ocultados com desativação da regra. O lint amplo não está integralmente aprovado. Auditoria das dependências de runtime de Orders: zero vulnerabilidades conhecidas reportadas pelo npm nesta retomada.

Logs locais: `artifacts/remaining-*-tests.log`, `remaining-orders-final-tests.log`, `remaining-identity-postgres.log`, `remaining-attributes-postgres-final.log`, `remaining-partner-legal-final.log`, `remaining-integration.log`, `remaining-browser.log` e `remaining-editor-browser.log`. Dados de teste apenas no cluster descartável `127.0.0.1:55434/potala_completion`. Nenhum pagamento ou e-mail externo foi enviado.

## Pendências contratuais que continuam reais

Publicação coordenada e homologação de produção; textos e requisitos de documentos aprovados; entrega de e-mail e cobertura dos eventos restantes; transportadora e emissão fiscal; aceites obrigatórios do cliente; revisão dos produtos reais; aprovação dos destinos 301; capacitação efetivamente realizada/gravada; MFA, rotação de segredos e backup/restauração comprovados no ambiente real; capacidade de mil usuários, LCP e disponibilidade no ambiente publicado. Provas locais anteriores de backup e LCP continuam válidas apenas para o ambiente e a data registrados. Não foram substituídas por este relatório.

## Implantação e retorno

Usar o procedimento em `launch-runbook-20261113.md`, junto de `deploy/render/ROLLBACK.md`. Não aplicar rollback destrutivo das tabelas novas. As versões recentes do frontend e backend devem avançar juntas; manter a imagem anterior e o inventário privado de configurações. A fila e as tabelas novas permanecem preservadas se os workers forem desligados.
