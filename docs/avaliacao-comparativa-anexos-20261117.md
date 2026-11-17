# Avaliação comparativa dos projetos Potala

17 de novembro de 2026 • Requisitos, código e funcionamento publicado

O marketplace evoluiu em contas, documentos, catálogo, operação multivendedor, relatórios e notificações. A nova checagem pública recuperou 38 de 39 resultados esperados após uma primeira medição com indisponibilidade parcial. A API de cursos e eventos continua retornando 500. Portanto, a existência do código e a publicação das telas ainda não permitem declarar o atendimento integral ao Anexo I.

Esta avaliação cobre o frontend e o gateway com os quatro serviços do marketplace. O site institucional, o cadastro completo de terapeutas e o blog/revista permanecem fora da execução atual por orientação do responsável. Eles continuam presentes no PDF completo e não são classificados como entregues por este relatório.

## Fontes e interpretação

Foram relidos integralmente os arquivos “Marketplace e site institucional Potala - Tironi (Anexo I) - 07ago26_SuperSign.pdf”, com 11 páginas no arquivo, e “Site Potala Agosto 2026 (1).docx”, com 61 parágrafos extraídos, incluindo vazios. O PDF define funções, limites e critérios de entrega; o Word reúne 50 referências de URLs, 48 distintas, para efeitos visuais e narrativa. Os links do Word foram analisados como referências descritas no documento, sem nova inspeção de cada site externo.

As instruções operacionais usadas nesta análise vêm das solicitações do responsável: foco no marketplace, Instituto separado, medição própria com tags externas desligadas e gateway financeiro adiado. O adiamento do gateway não elimina a pendência perante o PDF. O briefing visual não foi tratado como autorização para reproduzir integralmente todos os efeitos dos sites de referência.

## Como os projetos se relacionam

O frontend Next.js está na Vercel. O repositório `potala-marketplace-deploy` contém o gateway e os quatro serviços NestJS, executados como processos distintos na mesma unidade Render. Os domínios permanecem separados em um banco PostgreSQL, nos schemas identity, sellers, catalog e orders. A consolidação de hospedagem não converteu os quatro domínios em uma única tabela ou módulo.

| Projeto | Papel e evolução | Estado da avaliação |
|---|---|---|
| Frontend | Vitrine areia/amarelo, busca, áreas de cliente/loja/admin, recuperação, documentos, políticas, atributos, atividades e relatórios | Páginas públicas e layout desktop/celular verificados. Fluxos autenticados de produção ainda precisam de homologação com contas controladas |
| Gateway | Entrada única, roteamento, bloqueio de caminhos internos, CORS e agregação de readiness | Caminhos e negativas públicos verificados. Houve indisponibilidade parcial inicial, seguida de recuperação |
| Identity | Contas, sessões, recuperação/confirmação, perfis administrativos, inbox e envio Brevo | Código testado; e-mail recebido conforme confirmação do responsável em 13/11. Ciclo completo de troca de senha não foi repetido em produção em 17/11 |
| Sellers | Cadastro e análise de parceiros, documentos, situação da loja, preferências financeiras e entrega | Implementado e testado localmente; documentação exigida e regras reais precisam de configuração e homologação publicada |
| Catalog | Produtos, estoque, atributos, atividades, materiais, contato, analytics e políticas | Produtos/categorias/atributos/políticas respondem após recuperação. Atividades continuam com erro 500 |
| Orders | Pedido multivendedor, idempotência, cupons, frete, cálculo financeiro, anexos fiscais, pós-venda e exportações | Implementado e testado localmente. Pagamento real/split/repasse não integrados; fluxo autenticado publicado não auditado nesta rodada |

## Comparação com os repositórios originais

As cópias antigas dos serviços ainda estão nas pastas de mesmo nome da raiz. As alterações novas estão nas cópias dentro de `potala-marketplace-deploy`. Implantar os repositórios originais antigos não leva automaticamente as melhorias da consolidação.

| Serviço | Arquivos na base antiga | Arquivos na cópia consolidada | Novos | Alterados |
|---|---|---|---|---|
| Gateway | 21 | 22 | 1 | 8 |
| Identity | 68 | 94 | 26 | 17 |
| Sellers | 59 | 81 | 22 | 22 |
| Catalog | 85 | 131 | 46 | 20 |
| Orders | 119 | 147 | 28 | 32 |

Contagem de src, prisma e package.json/package-lock.json, com quebras de linha normalizadas. Nenhum arquivo desses conjuntos foi removido na comparação. Contagem textual não mede qualidade, cobertura funcional ou compatibilidade por si só.

Versões locais: consolidado `1595e7a`, branch `migration/render-bundle`; frontend `8b706c6`, branch `feature/marketplace-completion-20261110`. Bases originais: Gateway fa1883e; Identity de9e8eb; Sellers fc37f37; Catalog 3c9a7d6; Orders ca82232. O SHA exato que está atendendo em produção não foi obtido dos painéis de hospedagem.

## Confronto com o briefing visual Word

| Pedido visual descrito no Word | Situação observada |
|---|---|
| Slides e seções parcialmente fixas | Há navegação e componentes animados, mas não foi comprovada equivalência com os efeitos de referência |
| Scroll narrativo, elementos sticky e sobreposição | Não há aceite documentado de uma sequência completa de storytelling equivalente às referências |
| Abertura por vídeo antes de apresentar a navegação | Não comprovada no marketplace; a página inicial atual usa imagem de destaque |
| Paralaxe, imagens que se reorganizam e transições entre seções | Necessária uma revisão visual específica, com lista de efeitos aprovados, caso permaneçam exigidos para o marketplace |
| Identidade e experiência atual aprovadas durante o trabalho | Paleta areia/amarelo e contraste de cards foram implementados conforme as orientações posteriores. Isso não substitui o aceite de todos os efeitos do briefing |

As referências são dirigidas ao site do Instituto no documento original. A comparação acima registra a diferença, sem transferir automaticamente toda a execução institucional para o marketplace.

## Comparação funcional com o PDF

| Requisito | O que existe | O que falta para o aceite completo |
|---|---|---|
| Catálogo e busca | Categorias, busca, ordenação, variações/SKU, atributos tipados e edição | Configurar atributos reais, revisar catálogo e homologar os tipos de item; entrega digital/agendamento de serviços ainda não estão completos |
| Cadastro login e recuperação | Telas publicadas, tokens temporários de uso único, revogação de sessões e Brevo | Comprovar em produção troca, senha antiga recusada, sessões revogadas e replay recusado. Confirmação obrigatória está desligada na configuração informada |
| Área do cliente | Perfil, endereços, pedidos, favoritos, cupons, avaliações, inscrições, agenda, materiais e privacidade | Homologar as jornadas autenticadas na versão publicada e concluir dependências de atividades/pagamento |
| Carrinho checkout e cupons | Pedido de várias lojas, cupons percentual/fixo/frete, centavos e idempotência | Homologar o conjunto publicado; pagamento real permanece bloqueado sem gateway |
| Entrega e retirada | Cotação autoritativa, tabela por loja, retirada e snapshot | Integração com até um serviço principal de frete, regras comerciais e configuração das lojas aprovadas |
| Pagamento comissão e split | Políticas versionadas, cálculo, taxas e preparação de estorno | Gateway aprovado, Pix/cartão, recebedores, split automático, conciliação, estorno, chargeback e cenários assíncronos reais. Adiado nesta etapa por solicitação do responsável |
| Parceiros | Até dez tipos documentais, análise, correção, reenvio, histórico e adesão versionada | Tipos e termos reais configurados; ciclo homologado com os status, dados e papéis publicados |
| Painel do vendedor | Produto, estoque, preço, pedidos, entrega, financeiro e atividades | Validar em produção dono/funcionário e isolamento entre lojas; concluir integrações financeiras e demais dependências |
| Painel administrativo | Cinco perfis configuráveis, concessões, escopo, validade/revogação e auditoria | Bootstrap/acessos efetivos, configuração e homologação de cada módulo com permissões reais |
| Cursos e eventos | Três tipos, instrutores, modalidade, local/link, sessões, vagas, inscrições e materiais | Corrigir API 500, conferir migrations/dados e homologar a jornada. A página abrir não comprova inscrição |
| Fiscal e comprovantes | Anexos privados PDF/XML, download autorizado e auditoria | Validar o fluxo fiscal aprovado pelo Potala, incluindo documentos próprios e dos parceiros. O PDF não exige necessariamente que a plataforma emita automaticamente a NF-e |
| Notificações e atendimento | Inbox, Brevo, vinte modelos e filas idempotentes; fundamentos de reclamações | Cobertura automática completa dos eventos, incluindo agendamentos, suporte, avaliações, retornos e reembolsos; demonstração do atendimento completo |
| Relatórios | Vinte subvisões em dez grupos, filtros, CSV/XLSX e permissões | Homologar com dados reais autorizados e perfis de produção. Repasse previsto e estorno preparado não equivalem a movimentação financeira |
| Políticas e aceites | Rascunho/publicação/revogação, versões/hash e aceite imutável | Cinco textos aprovados continuam sem publicação nas consultas atuais; concluir aceites obrigatórios do cliente |
| Analytics consentimento e SEO | Medição própria, contato confirmado no servidor, retirada de consentimento e SEO básico | Homologação de eventos publicados, ferramentas de indexação aprovadas, destinos 301 pertinentes e aprovação editorial. GTM externo não é exigido como substituto da medição própria aprovada |
| Migração e conteúdo | Inventário legado e cadastro inicial de produtos | Relatório reconciliado de conteúdos aplicáveis, exclusões aprovadas e revisão final. Não há migração de histórico antigo de clientes/pedidos prevista para o marketplace |
| Segurança e disponibilidade | Controles de sessão, validações, menor privilégio, logs protegidos e testes locais | MFA quando disponível, rotação comprovada, revisão sem achados altos/críticos abertos, monitoramento e atendimento às metas publicadas |
| Documentação e treinamento | Manuais, arquitetura, retorno, relatórios e roteiro preparados | Entrega final organizada, inventário de contas/custos/acessos, treinamento gravado de quatro horas para até dez pessoas e aceite. Preparar roteiro não comprova ministrar a sessão |

## Validações realizadas em 17 de novembro

A primeira rodada HTTP teve 23 resultados esperados e 16 falhas, todas com 503. Depois, readiness e produtos responderam 200. A repetição integral teve 38 resultados esperados e uma falha: GET /activities com 500. Isso caracteriza indisponibilidade parcial transitória observada, não uma causa já diagnosticada. Não atribuímos automaticamente o incidente à suspensão do plano gratuito, banco ou erro de implantação sem os logs.

Os dez testes de navegador passaram: home, catálogo, recuperação e cursos em Chrome desktop/celular, sem overflow horizontal, e origem das chamadas de API observadas apontando para o Render. Esses testes não invalidam as falhas HTTP: o frontend pode abrir com dados vazios/fallback quando a consulta de servidor falha. Não houve login autenticado de produção nesta rodada.

As cinco políticas responderam com configured:false, a consulta de produtos retornou cinco itens e ainda há `TESTE REGRESSAO Produto Seller B 1663039609`. Atributos públicos respondem, mas não foi comprovada configuração editorial completa. Nenhum dado foi removido nem texto jurídico publicado nesta avaliação.

As suítes locais sem PostgreSQL foram novamente executadas nesta rodada; os resultados finais constam no quadro de testes anexado. As sete provas de banco de recuperação e as demais provas de integração com PostgreSQL são evidências históricas de 13/11, não novas execuções de 17/11. O início do banco descartável foi bloqueado pela revisão automática, com a mensagem genérica blocked by policy; a operação não foi contornada.

| Suíte executada em 17 de novembro | Aprovados | Condicionais não executados |
|---|---|---|
| Identity | 118 | 7 |
| Sellers | 124 | 0 |
| Catalog | 286 | 19 |
| Orders | 670 | 3 |
| Gateway | 76 | 0 |
| Total dos serviços | 1274 | 29 |
| Supervisor e configuração | 13 | 0 |

Não houve falha nas suítes executadas. Esses números não incluem os testes HTTP/navegador publicados e não substituem prova de integração com banco real, homologação comercial ou teste de invasão completo.

## Critérios quantitativos que ainda exigem prova

O PDF exige backup diário com retenção mínima de 30 dias, cópia separada, RPO até 24 horas, RTO até oito horas e ensaio periódico; LCP até três segundos no percentil 75 em condições acordadas; mil usuários simultâneos; duas versões estáveis recentes de Chrome, Edge, Firefox e Safari em computador/tablet/celular; e meta mensal de disponibilidade de 99,5%, com monitoramento em intervalos de até cinco minutos.

As evidências anteriores de backup/LCP foram locais. O cenário antigo de mil usuários do mesmo IP sofreu muitos 429 e não comprovou a capacidade contratada. Não há nesta avaliação prova nova de restauração de produção, carga representativa, toda a matriz de navegadores, MFA ou rotação de segredos. Acessibilidade por teclado, foco, contraste, alt e rótulos precisa de validação abrangente; há revisão visual pendente do banner.

## Matriz de aceite T01 a T14

| Caso do Anexo I | Situação atual |
|---|---|
| T01 Cadastro login e recuperação | Implementado; e-mail recebido conforme responsável; ciclo completo publicado ainda sem prova integral |
| T02 Parceiro | Implementado localmente; documentos/termos/configuração e homologação de produção pendentes |
| T03 Produto e estoque | Catálogo publicado e fundamentos testados; revisão editorial e homologação de CRUD/moderação/estoque pendentes |
| T04 Compra e entrega | Testado localmente com mock; frete externo e operação real pendentes |
| T05 Pagamento e webhook | Não integrado ao provedor real; fora desta etapa por decisão do responsável |
| T06 Split e conciliação | Cálculo preparado; execução e reconciliação reais pendentes |
| T07 Isolamento de pedidos | Evidência local existente; repetir em produção com contas permitidas |
| T08 Reclamação e notificação | Implementação parcial; completar cobertura de eventos e provar atendimento completo |
| T09 Permissões administrativas | Testes de autorização locais e negativas públicas; configuração e homologação autenticada pendentes |
| T10 Migração e 301 | Inventário/alias existem; conciliação e destinos históricos pertinentes pendentes |
| T11 Backup e restauração | Prova local histórica; ambiente publicado ainda não comprovado |
| T12 Capacidade e compatibilidade | Não comprovado integralmente; testes atuais de Chrome não cobrem a matriz exigida |
| T13 Segurança e MFA | Controles implementados; MFA, rotação e revisão publicada ainda sem prova completa |
| T14 Analytics e SEO | Implementados em parte; homologação publicada, indexação e 301 pertinentes pendentes |

Esses casos não são aprovados automaticamente pela quantidade de testes unitários. O PDF também exige pelo menos um caso por função adicional incluída, documentação de entrega e aceite explícito.

## Prioridades para encerrar o marketplace

1. Diagnosticar e estabilizar as respostas 503 e corrigir o 500 de atividades, com logs e inventário de migrations.
2. Conferir as migrations restantes dos quatro schemas e homologar com cliente, dono de loja, funcionário e administrador.
3. Revisar catálogo e desativar o item de teste após conferir vínculos; configurar atributos, documentos, entrega e textos aprovados.
4. Completar aceites do cliente, eventos de notificação e jornadas aplicáveis de digital/serviço.
5. Homologar relatórios, pós-venda e fluxo fiscal; concluir 301/indexação e conteúdo pertinente.
6. Decidir a retomada do gateway e das integrações comerciais, sem apresentar cálculo como liquidação financeira.
7. Comprovar segurança, backup, carga, desempenho, acessibilidade e monitoramento; concluir custos/acessos, treinamento e aceite.

## Evidências e limitações de acesso

Fontes extraídas, comparação textual e PDFs finais ficam em `analise-potala/reavaliacao-20261117`. Resultados HTTP inicial/final, navegador e logs das suítes ficam em `potala-marketplace-deploy/artifacts`, com sufixo 20261117. Não foram usados tokens ou senhas no relatório e não foram consultados dados privados de clientes em produção. Ausência de prova significa que o critério ainda não pode ser marcado como aprovado, não que necessariamente inexista configuração fora dos acessos disponíveis.
