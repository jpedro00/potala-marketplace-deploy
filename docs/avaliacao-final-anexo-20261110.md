# Reavaliação do marketplace perante o Anexo I

Data: 10/11/2026. Fonte: PDF assinado, versão de 07/08/2026, páginas 1 a 10; arquivo original reconferido nesta avaliação. A página 11 contém o registro das assinaturas. Escopo: marketplace e requisitos transversais aplicáveis. Instituto, profissionais/terapeutas e blog institucional não foram avaliados como entrega deste pacote; continuam incluídos no PDF completo.

## Parecer

O marketplace evoluiu de uma base comercial com lacunas para uma implementação com controles administrativos, exportações, preparação financeira e jornadas de atividades testadas localmente. Ainda não está pronto para aceite integral ou operação financeira real nos termos do anexo. Pagamentos, frete, recuperação de senha, fiscal/documental, notificações, conteúdo e provas operacionais permanecem incompletos.

As alterações recentes estão na branch `feature/marketplace-completion-20261110` dos dois repositórios, sem implantação em produção. Migrations foram executadas somente em PostgreSQL descartável. Não se deve tratar resultado local como resultado da aplicação publicada.

Esta avaliação revisa as classificações mais amplas do resumo anterior: dez exportações funcionais não completam a cobertura temática contratada; a jornada básica de curso não cobre todos os dados exigidos; material de treinamento não comprova treinamento ministrado.

## Critérios de classificação

- **Pronto local:** componente implementado e com evidência local de funcionamento. Ainda sujeito a homologação/publicação.
- **Parcial:** existe entrega concreta, mas faltam requisitos, integração, conteúdo ou comprovação de ponta a ponta.
- **Pendente:** função ausente, integração não executada ou evidência operacional não disponível.
- **Publicado com evidência anterior:** comprovado na visita de 09/11; não constitui revalidação de produção em 10/11.

Não foi atribuída porcentagem de conclusão: contagem de telas ou testes não pondera corretamente pagamento, integridade, segurança e continuidade.

## Comparação por requisito

| Exigência do PDF | O que foi feito | Situação | O que falta para considerar entregue |
|---|---|---|---|
| Arquitetura e implantação (§1.3, §5 e §9) | Gateway e quatro domínios no pacote Render; configuração isolada por serviço, readiness, supervisor, Docker e retorno documentado | Pronto local para a arquitetura; entrega operacional parcial | Publicar alterações recentes, validar ambiente publicado, inventariar contas/titulares e registrar versão de lançamento |
| Catálogo e estoque (§3.1, p.2) | Catálogo, busca, categorias, imagens, variações/SKU, reserva e baixa; fallback de imagem | Parcial | Demonstrar até dez atributos configuráveis por tipo, filtros aprovados e jornadas de todos os tipos de item; revisão editorial dos produtos |
| Produtos de lançamento e migração (§6.1, pp.4–5) | Cadastro inicial e evidência de produtos públicos; não há obrigação de importar clientes/pedidos antigos | Parcial | Conferir títulos, preços, SKUs, estoque e imagens fornecidos; conciliar quantidades; confirmar e retirar conteúdo de teste. Consulta pública recente sofreu timeout, sem saneamento no banco publicado |
| Cadastro, login e sessão (§3.1) | Conta cliente/parceiro, hash de senha, login/logout e sessão; fluxo local integrado aprovado | Parcial | Recuperação de senha continua com aviso de indisponível; confirmação de cadastro por e-mail e fluxo válido no ambiente publicado ainda sem comprovação |
| Carrinho, cupons, checkout e entrega (§3.1 e §4.1) | Carrinho, cupons no backend, pedido multivendedor, retry e estoque testados | Parcial | Frete continua zero no cálculo; integrar serviço e regras de entrega/retirada por loja, testar os três tipos de cupom e totais comerciais no navegador |
| Preferências de pagamento do vendedor (§3.1 e §4.2) | Proprietário configura Pix/cartão e preferência de periodicidade; funcionário não pode assumir controle financeiro | Pronto local para preferências; recebimento parcial | DTO permite preferências, não cadastro bancário completo nem onboarding do recebedor. Vínculo/KYC e habilitação dependem da integração do provedor |
| Comissão, taxas e split (§4.2, p.3) | Políticas versionadas por produto/categoria/vendedor/plataforma, prioridade explícita, centavos inteiros, rateio de desconto e snapshots por compra | Pronto local para o cálculo; financeiro parcial | Aprovar regras/percentuais, conferir a tarifa fixa por linha e executar a divisão efetiva no gateway; validar extrato e conciliação reais |
| Pix, cartão, webhook, estorno e chargeback (§4.2 e §7.3) | Contrato do adaptador, chaves idempotentes, tratamento de estados, estorno preparado com limite concorrente, indicação de reconciliação | Parcial | Adaptador real, credenciais, tokenização, assinatura/replay de webhook, cobrança/estorno efetivos, repasses, saldo insuficiente, chargeback e conciliação. Não se resume a inserir uma chave |
| Área do cliente (§3.1) | Dados, endereços, pedidos, favoritos, avaliações e pós-venda; novas inscrições, agenda e downloads | Parcial | Recuperação, notas/comprovantes, privacidade e suporte completos; validar todos os módulos com contas publicadas |
| Aprovação de parceiros (§3.1 e §4.1) | Solicitação, dados básicos, aprovação e isolamento entre lojas testados | Parcial | Até dez tipos de documento, envio/análise/correção/reenvio, termos e estados contratados completos; onboarding financeiro |
| Painel do parceiro (§3.1) | Produtos, estoque, pedidos próprios e preferências; atividades e participantes | Parcial | Fiscal, entregas reais, repasses/saldos e integração financeira. Testar todas as operações do painel por proprietário/funcionário |
| Cinco perfis administrativos (§3.1) | Perfis, permissões efetivas no backend, escopo global/por lojas, validade, revogação e auditoria transacional de concessões | Pronto local para a fundação de acesso | Bootstrap e configuração de perfis em produção; validar permissões e principais ações de todos os módulos, sem conceder acesso automático às contas antigas |
| Relatórios CSV/XLSX (§3.1) | Dez visões reais, filtros/escopo, proteção contra fórmula, arquivos XLSX válidos e limite de 10.000 linhas com erro explícito | Pronto local para exportar; cobertura contratual parcial | Alinhar as dez visões aos temas exigidos: produtos/estoque, vendedores/clientes, cursos/eventos, faturamento e repasses não possuem cobertura dedicada completa. Exportação de vendas não inclui coluna própria de taxa do gateway |
| Cursos, eventos e recorrência (§3.1) | Três tipos, detalhes, sessões, datas/horários, vagas, prazo, inscrições, reserva paga, retomada após expiração, agenda, participantes e materiais | Parcial | Campos próprios e gestão de instrutores, modalidade e local/link; conteúdo real e comunicação de confirmação; pagamento efetivo. Texto livre na descrição não substitui esses fluxos |
| Downloads e acesso a materiais (§3.1) | PDF/PNG/JPEG/TXT até 5 MiB, validação de formato/tamanho, autorização por inscrição, auditoria, bloqueio antes de pagamento e após revogação | Pronto local para o fluxo implementado | Homologar conteúdo e uso publicado; validação não equivale a antivírus/CDR completo nem a entrega de todos os produtos digitais do catálogo |
| Reclamações e notificações (§3.1 e §4.1) | Modelos/APIs de reclamação, mensagens, devolução e disputa | Parcial | Provar o ciclo Potala/parceiro/cliente, anexos, responsável e solução; Brevo e até vinte modelos iniciais com recebimento real, inclusive pagamentos e inscrições |
| Fiscal e documentos (§4.3) | Pedidos identificam loja e registram dados operacionais | Pendente de fluxo completo | Implementar o fluxo fiscal/documental aprovado e disponibilizar notas/comprovantes; não presumir emissão só porque existe pedido |
| Políticas e aceites (§3.1 e §4.3) | Medição opcional com registro técnico de consentimento/retirada | Parcial | Termos, privacidade, cookies, compra/troca/cancelamento e adesão aprovados, páginas acessíveis e aceites versionados. Consentimento de analytics não cobre os demais aceites |
| SEO (§6.2) | Robots, sitemap, canonical e JSON-LD com evidência publicada anterior; registro de 301 validado e alias local testado | Parcial | Inventário de URLs antigas e mapeamento aplicável, títulos/descrições editáveis completos e conexão às ferramentas de indexação aprovadas. `/loja/dashboard` → `/loja` não encerra a migração SEO |
| Analytics e tags (§5.1 e §6.2) | Funil próprio consentido, eventos de produto/carrinho/checkout/cadastro/parceiro, compra confirmada via servidor, deduplicação e retirada; painel admin | Parcial | Gerenciador de tags aprovado e validação publicada do funil completo. `contact_click` mede clique, não envio de contato; validar evento de envio confirmado e cadastro das ferramentas aprovadas |
| Segurança (§7.1) | Guards, validação, sessão, origem, limitação de tráfego, negativas de autorização, correção do bypass por query e atualização de dependências | Parcial com evidências positivas | MFA/acessos dos fornecedores, rotação dos segredos expostos, revisão/pentest mais abrangente e homologação publicada. Zero achados no npm não certifica toda a aplicação |
| Backup/restauração (§7.2) | Código preservado, procedimento de retorno e base descartável de teste | Não comprovado para dados de produção | Backup diário, retenção mínima de trinta dias, cópia separada e restauração íntegra demonstrando RPO até 24 h/RTO até 8 h; repetir semestralmente |
| Capacidade/desempenho (§7.3) | Builds e testes funcionais, amostras anteriores Chrome desktop/mobile | Não comprovado | 1.000 usuários simultâneos, LCP p75 até 3 s, duas versões recentes dos quatro navegadores e computador/tablet/celular |
| Disponibilidade (§7.4) | Health/readiness dos quatro serviços | Não comprovado | Monitoramento das operações essenciais a cada até cinco minutos e série temporal para a meta mensal de 99,5% |
| Acessibilidade (§7.5) | Elementos semânticos e verificações pontuais de interface | Parcial/não comprovado integralmente | Roteiro de teclado, foco, rótulos, contraste e alternativas textuais nos fluxos essenciais; ausência de certificação formal não dispensa os critérios mínimos |
| Manuais, treinamento e transição (§9) | Manual operacional/técnico, implantação/retorno e roteiro de quatro horas preparados | Parcial | Cobrir todos os módulos finais em PDF/DOCX ou wiki exportável; ministrar e gravar quatro horas para até dez pessoas; inventário de contas/custos, exportação/restauração e transição contratada |

## Dez relatórios atuais e alcance

Vendas por loja, pedidos, itens vendidos, transações, avaliações, cupons, devoluções, reclamações, disputas e favoritos. São visões fundamentadas nos dados existentes, mas a quantidade dez, isoladamente, não comprova atendimento aos temas listados no PDF. A próxima revisão deve substituir/compor visões após validar prioridades, preservando cobertura de todos os temas exigidos no conjunto aprovado.

O limite técnico de 10.000 linhas precisa ser documentado e submetido à validação da operação; o anexo não concede autorização geral para reduzir volumes por conveniência técnica.

## Evidência dos testes existentes, reconferida nesta avaliação

Os resultados abaixo são das execuções de 10/11 preservadas em logs. Esta rodada foi uma reavaliação documental/de código e conferência das evidências, sem repetir suites que não sofreram alteração funcional e sem criar transações de produção.

| Suite | Suites aprovadas | Testes aprovados | Evidência em `potala-marketplace-deploy/artifacts/` |
|---|---:|---:|---|
| Identity | 10 | 112 | `completion-identity-tests.log` |
| Sellers | 11 | 112 | `completion-sellers-tests.log` |
| Orders | 31 | 613 | `completion-orders-final.log` |
| Catalog, incluindo PostgreSQL opt-in | 17 | 255 | `completion-catalog-final.log` |
| Gateway | 6 | 75 | `completion-gateway-final.log` |
| Total dos serviços | 75 | 1.167 | Zero falhas nos resultados finais citados |
| Supervisor/configuração | - | 8 | `completion-runtime-tests.log` |

Além das suites:

- Builds dos cinco serviços e frontend e TypeScript do frontend aprovados; migrations aditivas aplicadas apenas em PostgreSQL local descartável.
- Fluxo integrado real dos cinco processos: readiness, login/logout, aprovação de duas lojas, dois produtos, checkout mock multivendedor, rateio reconciliado, retry sem duplicação, estoque uma vez, isolamento entre lojas e bloqueio de rotas internas.
- Mesmo fluxo: acesso administrativo, negação ao cliente, CSV e XLSX lido de volta por ExcelJS, criação/publicação de curso, inscrição gratuita, material autorizado e API analytics rejeitando compra enviada pelo cliente. Evidências: `completion-flow-result.log`, `completion-flow.log` e roteiro `deploy/render/test/completion-flow.mjs`.
- PostgreSQL: vagas concorrentes e idempotência de inscrição, expiração/liberação de vaga, acesso a materiais e retirada que impede analytics tardio. Provas financeiras adicionais existem, mas não foram contadas como novas cobranças reais.
- Chrome local: HTTP 301, nenhum evento antes do consentimento, evento após permissão, solicitação de retirada e nenhuma nova coleta após recusa. Analytics foi interceptado no navegador; este teste não comprova o trajeto completo navegador → API de produção. Evidência: `completion-browser.json`.
- Auditoria `npm audit --omit=dev`: zero vulnerabilidades conhecidas nos seis pacotes nos arquivos `security-audit-{identity,sellers,catalog,orders,gateway,frontend}-final.json`. Não abrange todos os riscos de negócio, configuração, infraestrutura, código ou dependências de desenvolvimento.
- SEO publicado anteriormente: quatro testes de navegador locais e quatro publicados após o ajuste de 09/11; robots/sitemap/fallback HTTP 200. Estas provas não foram somadas aos 1.167 testes dos serviços nem apresentadas como novas verificações de produção.

## Matriz contratual T-01 a T-14 (§8, p.7)

| ID | Situação perante o resultado mínimo completo | Prova existente e lacuna |
|---|---|---|
| T-01 Cadastro/login/recuperação | Parcial | Cadastro/login/logout locais; faltam confirmação e recuperação segura |
| T-02 Parceiro | Parcial | Cadastro/aprovação; faltam ciclo documental, termos e correção/reenvio completos |
| T-03 Produto/estoque | Parcial | Produto aprovado, reserva e baixa; falta homologação completa de CRUD/moderação, atributos e catálogo final |
| T-04 Compra/entrega | Parcial | Pedido multivendedor e retry; faltam frete, retirada e conjunto comercial completo |
| T-05 Pagamento/webhook | Parcial, bloqueador comercial | Estados/retry testados com mocks; falta provedor e cenários efetivos aprovado/negado/pendente/estorno/replay |
| T-06 Split/conciliação | Parcial, bloqueador comercial | Cálculo e snapshots locais; falta divisão, estorno e conciliação com extrato real e regras aprovadas |
| T-07 Isolamento de pedidos | Pronto local no caso exercitado | Loja A negada para pedido da loja B; falta repetir com perfis e dados permitidos na versão publicada |
| T-08 Reclamação/notificação | Parcial | Fundamentos de pós-venda; falta demonstrar recebimento e solução conjunta por todos os envolvidos |
| T-09 Permissões admin | Pronto local na fundação; aceite parcial | Negativas, escopos/revogação e auditoria de acesso; falta publicar/configurar e homologar módulos com perfis reais |
| T-10 Migração/301 | Parcial | Alias 301 testado e cadastro inicial; falta inventário e conciliação das origens aplicáveis |
| T-11 Restauração | Não comprovado | Banco de teste e backup de código não demonstram recuperação do banco/arquivos publicados |
| T-12 Capacidade/compatibilidade | Não comprovado | Amostras funcionais não substituem carga, p75 e matriz de navegadores/dispositivos |
| T-13 Segurança/MFA | Parcial | Controles e auditoria de dependências; faltam MFA, rotação e revisão completa publicada |
| T-14 Analytics/SEO | Parcial | SEO básico e funil local; faltam 301 históricos, tags aprovadas e envio confirmado de contato |

O §8.4 exige ampliar os casos para cada funcionalidade incluída. Não existe equivalência automática entre o número de testes unitários e o atendimento dos catorze testes contratuais completos.

## Ordem de encerramento recomendada

1. Gateway e regras comerciais aprovadas, recebedores/KYC, Pix/cartão, webhook, split, estorno e conciliação reais; manter a cobrança bloqueada sem provedor.
2. Frete/retirada, recuperação/confirmação de conta, fiscal/documentos, termos e notificações reais.
3. Completar os detalhes de cursos, cobertura dos relatórios e evento de envio de contato; aprovar ferramenta/gerenciador de tags.
4. Revisar catálogo, conteúdo de lançamento e inventário/301; não excluir dados reais sem confirmar seu papel operacional.
5. Homologar perfis e fluxos, preparar backup/retorno, publicar migrations/backend/frontend e executar smoke autenticado em produção.
6. Comprovar segurança/MFA/rotação, restauração, carga, LCP p75, compatibilidade, acessibilidade e monitoramento.
7. Consolidar documentação final e inventário, ministrar/gravar treinamento e recolher aceite escrito. O §8.3 não equipara publicação a aceite enquanto persistirem lacunas como integrações provisórias e funções ausentes.

## Rastreabilidade de código

- Exportações: `potala-marketplace-deploy/potala-orders-service/src/modules/reports/reports.service.ts`.
- Frete: `potala-marketplace-deploy/potala-orders-service/src/modules/orders/orders.service.ts`, cálculo `shippingCents = 0`.
- Provedor bloqueado sem integração: `potala-marketplace-deploy/potala-orders-service/src/modules/payments/payments.module.ts`.
- Preferências, sem formulário de onboarding bancário: `potala-marketplace-deploy/potala-sellers-service/src/modules/sellers/dto/update-payment-settings.dto.ts`.
- Curso e sessão: schema Catalog e `src/modules/activities/activities.dto.ts`; não há campos próprios de instrutor/modalidade/local/link.
- Medição de contato: `marketing-place-potala-frontend/src/components/analytics/AnalyticsProvider.tsx`, evento `contact_click`.
- Recuperação: `marketing-place-potala-frontend/src/components/auth/LoginForm.tsx`, indicação de disponível em breve.
- Manuais e roteiro: `potala-marketplace-deploy/docs/manual-marketplace-20261110.md` e `treinamento-marketplace-20261110.md`.

Este relatório complementa a avaliação de 09/11 e corrige classificações excessivamente amplas da entrega local de 10/11. Não altera código nem estado de produção.
