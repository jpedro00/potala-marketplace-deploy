# Roteiro de apresentação do marketplace Potala

Roteiro para apresentar as funções implementadas a gestores e operadores do Potala. Versão de 13 de novembro de 2026. A apresentação completa dura aproximadamente 60 a 75 minutos; o percurso resumido ao final dura cerca de 15 minutos. O Instituto fica fora deste roteiro.

Frase de abertura: “Vamos acompanhar a jornada do cliente, a operação do vendedor e a gestão do marketplace. Mostraremos o que está publicado, o que foi validado em homologação e o que ainda depende de configuração ou integração.”

## Preparar a demonstração

- Abrir o site público e um ambiente de homologação com banco separado para operações de teste.
- Disponibilizar contas individuais de cliente, proprietário de loja, funcionário com acesso limitado e administrador com as permissões necessárias. Não compartilhar o superadministrador.
- Preparar duas lojas, produtos identificados como demonstração somente na homologação, estoque conhecido, cupom, entrega configurada, pedido de teste e atividade gratuita com instrutor, sessão, vagas e material.
- Preparar PDF/XML sem dados pessoais para documentos e anexos. Usar textos legais de demonstração somente na homologação; produção exige aprovação real.
- Confirmar previamente as migrations, políticas exigidas e acessos do ambiente demonstrado. A configuração financeira não substitui autorização de acesso aos módulos.
- Usar dados fictícios para pedidos, cadastros e contatos na gravação. Para Brevo, usar conta de teste controlada e ocultar a caixa de entrada durante cópia de links.
- Manter disponível o relatório `validacao-marketplace-apresentacao-20261113.md`. A API pública de atividades está com erro 500; não prometer demonstrar a jornada de inscrição no site publicado antes de corrigir.
- Manter gateway real fora da demonstração. A compra completa abaixo acontece em homologação com mock, nunca no ambiente de produção.

## 1 Apresentação visual e navegação

**Onde:** página inicial, cabeçalho, categorias, catálogo e rodapé. **Tempo:** dois minutos.

**Mostrar:** identidade visual em amarelo e areia, logo, busca, navegação por categorias, destaques, cards com contraste, preços, conta e carrinho. Abrir também a versão de celular e demonstrar que o conteúdo cabe na tela.

**Fala:** “A vitrine concentra os produtos e organiza o acesso às lojas, às atividades e à conta do cliente. Mantivemos a identidade Potala e destacamos os produtos para facilitar a leitura.”

**Evidência:** páginas públicas e navegação Chrome desktop/celular passaram. O produto de teste ainda publicado deve ser retirado da apresentação real após revisão.

## 2 Catálogo e descoberta de produtos

**Onde:** `/catalogo`, `/categoria/[slug]`, `/novidades`, `/ofertas`. **Tempo:** três minutos.

**Mostrar:** busca, categorias, ordenação, abertura dos produtos e estado de nenhum resultado. Na homologação, selecionar tipo de item e filtrar por atributo previamente configurado.

**Fala:** “O cliente encontra os produtos por diferentes caminhos e pode usar características definidas pela administração para refinar a escolha.”

**Resultado esperado:** a consulta retorna produtos compatíveis e o link abre o item correto. Filtros não devem ser apresentados com opções fictícias; precisam de definições e valores cadastrados.

## 3 Página do produto e página da loja

**Onde:** `/produto/[id]` e `/vendedor/[slug]`. **Tempo:** três minutos.

**Mostrar:** fotos, descrição, preço, variações, características, vendedor e informações públicas da loja. Apresentar a imagem alternativa quando uma foto estiver indisponível.

**Fala:** “O produto reúne a informação necessária para a compra e identifica a loja responsável. As características vêm dos dados cadastrados, e o histórico do pedido preserva o retrato da compra.”

**Limite:** cadastrar tipo digital ou serviço não implementa sozinho entrega de arquivos digitais nem agendamento de serviços. Revisão editorial, fotos corretas e conteúdo final continuam necessários.

## 4 Cadastro login e conta do cliente

**Onde:** `/acesso`, `/minha-conta`, `/minha-conta/configuracoes`, `/minha-conta/enderecos`. **Tempo:** três minutos.

**Mostrar na homologação:** criar cliente, entrar, consultar a conta, atualizar os campos disponíveis, cadastrar endereço e sair. Demonstrar uma área autenticada em janela sem sessão.

**Fala:** “Cada cliente tem sua própria conta e seus dados de operação. As áreas privadas exigem sessão válida; sair encerra o acesso daquela sessão.”

**Evidência:** autenticação e logout passaram na integração local; dez APIs protegidas recusaram chamadas sem sessão na produção. Não alegar homologação autenticada de produção a partir dessa negativa.

## 5 Recuperação de senha confirmação de email e Brevo

**Onde:** `/recuperar-senha`, `/redefinir-senha`, `/confirmar-email`. **Tempo:** quatro minutos.

**Mostrar com conta controlada:** pedir recuperação, confirmar recebimento, abrir o link em ambiente privado, definir nova senha e voltar ao login. Se for necessário exibir um replay, ocultar o token e mostrar apenas a mensagem de link inválido. Não ler senhas ou compartilhar a tela enquanto preenche o segredo.

**Fala:** “Os e-mails transacionais são enviados pela Brevo. O link de recuperação é temporário e de uso único. Ao concluir a troca, as sessões anteriores são revogadas.”

**Resultado esperado:** nova senha aceita, anterior recusada, link reutilizado recusado. Recuperação expira em 30 minutos e confirmação em 24 horas. Confirmação obrigatória para novos cadastros está desativada na configuração informada; sua existência não significa que todo cadastro esteja exigindo verificação.

**Evidência:** recebimento informado pelo responsável; regras de token, concorrência e sessão testadas localmente. Logs distinguem falha de IP, autorização e limite sem registrar segredos. Aceite da API Brevo não equivale a entrega/leitura.

## 6 Favoritos cupons e avaliações do cliente

**Onde:** `/minha-conta/favoritos`, `/minha-conta/cupons`, `/minha-conta/avaliacoes`. **Tempo:** três minutos.

**Mostrar na homologação:** guardar/remover favorito, consultar cupons vigentes e a área de avaliações. Demonstrar avaliação apenas com compra elegível já preparada.

**Fala:** “O cliente acompanha seus interesses, benefícios disponíveis e avaliações vinculadas às regras de compra do marketplace.”

**Limite:** não afirmar que qualquer visitante pode avaliar nem que existe edição/exclusão de avaliação sem conferir a regra efetiva. Preferências e cupons devem refletir a API, não dados promocionais de exemplo.

## 7 Carrinho e checkout com várias lojas

**Onde:** `/carrinho`, `/checkout`, `/checkout/sucesso`. **Tempo:** quatro minutos.

**Mostrar somente na homologação:** adicionar um item de cada uma das duas lojas, alterar quantidades, aplicar cupom, escolher endereço e entrega e concluir uma compra simulada. Consultar o pedido resultante.

**Fala:** “A compra pode reunir várias lojas. O sistema organiza o pedido principal e os subpedidos de cada vendedor, preservando preços, descontos, frete e responsáveis.”

**Resultado esperado:** estoque debitado uma única vez, soma dos subpedidos correta, repetição idempotente sem duplicar compra ou reserva. Cada loja acessa somente seu subpedido.

**Limite obrigatório:** “Esta aprovação é uma simulação de homologação. O gateway real ficou fora desta etapa; não há cobrança nem repasse bancário demonstrado.”

## 8 Preferências de pagamento comissões taxas e split

**Onde:** `/loja/configuracoes`, `/loja/financeiro`, `/admin/financeiro`. **Tempo:** quatro minutos.

**Mostrar na homologação:** proprietário configura meios aceitos e identificação mínima/preferências de recebedor; funcionário sem privilégio não altera dados financeiros. Administrador consulta/cria uma política aprovada de comissão e taxas. Comparar o retrato financeiro do pedido preparado.

**Fala:** “As regras financeiras são versionadas e o pedido guarda os valores calculados no momento da compra. A divisão prevista considera a precedência de produto, categoria, vendedor e plataforma.”

**Detalhes para perguntas:** valores em centavos; percentuais em pontos-base; 100 pontos-base equivalem a 1%; tarifa fixa aplicada por linha de pedido. A convenção exige aprovação comercial. Alterar política não reescreve compras anteriores.

**Limite:** cadastro mínimo não valida recebedor no provedor; split calculado não significa split executado. Estorno preparado e repasse previsto não são dinheiro movimentado. Relatórios deixam a falta de integração explícita.

## 9 Pedidos histórico e separação por vendedor

**Onde:** `/minha-conta/pedidos`, `/loja/pedidos`, `/admin/pedidos`. **Tempo:** três minutos.

**Mostrar na homologação:** o mesmo pedido nas perspectivas de cliente, loja A, loja B e administrador. Abrir histórico e transições permitidas. Tentar consultar o subpedido de outra loja com o usuário da loja A e mostrar a recusa.

**Fala:** “O cliente acompanha a compra completa. Cada vendedor opera apenas sua parte, e a administração acompanha a operação de acordo com suas permissões.”

**Evidência:** isolamento entre lojas, status, estoque e idempotência passaram localmente. Não alterar pedidos de clientes reais durante a apresentação.

## 10 Entrega retirada e frete

**Onde:** configurações da loja, `/loja/entregas` e checkout. **Tempo:** três minutos.

**Mostrar na homologação:** habilitar retirada com endereço; configurar entrega por UF/faixa de CEP, preço e prazo; simular cotação e aplicar cupom de frete. Demonstrar um destino sem opção configurada.

**Fala:** “O frete é calculado no servidor com as regras da loja. A opção e os valores ficam preservados no pedido; um valor enviado pelo navegador não define o preço final.”

**Limite:** não anunciar transportadora, rastreio automático ou cálculo externo como integrados. Retirada e gratuidade só existem quando configuradas explicitamente.

## 11 Documentos fiscais privados

**Onde:** detalhe do subpedido do vendedor, pedido do cliente e administração autorizada. **Tempo:** dois minutos.

**Mostrar na homologação:** anexar PDF/XML fictício, consultar como comprador e tentar acessar por outra loja. Revogar o anexo e demonstrar indisponibilidade posterior.

**Fala:** “O documento fica associado ao pedido e disponível somente para as partes autorizadas. Upload, consulta e revogação possuem controle de acesso e auditoria.”

**Limite:** até 5 MiB por arquivo e dez anexos ativos por subpedido. A função armazena documentos; não emite NF-e nem certifica sua autenticidade. Validação de formato não equivale a antivírus.

## 12 Devoluções reclamações e disputas

**Onde:** `/minha-conta/devolucoes`, detalhe do pedido e `/admin/devolucoes`, conforme os fluxos disponíveis. **Tempo:** três minutos.

**Mostrar com pedido de homologação preparado:** solicitação de devolução, análise do vendedor/admin e histórico; canais de reclamação, mensagens/evidências e escalonamento/disputa quando a situação permitir. Usar o caminho de tela realmente oferecido pelo estado do pedido.

**Fala:** “As solicitações de pós-venda têm registro e acompanhamento. A decisão operacional fica separada da execução financeira de eventual reembolso.”

**Limite:** não prometer devolução bancária automática. Não usar um pedido pago real para demonstrar decisões de teste.

## 13 Cadastro e análise de parceiros

**Onde:** cadastro de vendedor, `/loja/documentos`, `/admin/documentos-parceiros`, `/admin/vendedores`. **Tempo:** quatro minutos.

**Mostrar na homologação:** administrador define documentos exigidos, dono da loja envia arquivo, aceita a versão vigente da adesão e solicita análise. Administrador pede correção, vendedor reenvia e a análise considera a última versão. Mostrar histórico e situação da loja.

**Fala:** “A entrada de parceiros possui uma trilha de análise. Documentos são privados, há pedidos de correção e o aceite fica vinculado à versão do termo.”

**Limite:** até dez tipos ativos, arquivos PDF/JPEG/PNG de até 5 MiB. Tipos e termos aprovados precisam estar configurados. Na produção atual a política de adesão não está publicada; não afirmar que o onboarding completo foi homologado ali.

## 14 Produtos estoque e atributos pelo vendedor

**Onde:** `/loja/produtos`, `/loja/produtos/novo`, `/loja/estoque`, `/admin/produtos`, `/admin/catalogo`. **Tempo:** quatro minutos.

**Mostrar na homologação:** cadastrar produto com variação/SKU e estoque, revisar/moderar, editar título/descrição/preço/fotos e valores de atributos, abrir a vitrine e conferir a quantidade depois de uma compra simulada.

**Fala:** “A loja mantém a informação comercial e o estoque; a administração organiza categorias, modera os produtos e define as características disponíveis.”

**Resultado esperado:** até dez atributos ativos por tipo; texto, número, booleano ou escolha; dados inválidos recusados; loja não edita produto alheio. Demonstrar os tipos efetivamente configurados, sem presumir todas as jornadas de digital/serviço implementadas.

## 15 Cursos eventos inscrições agenda e downloads

**Onde:** `/cursos`, `/eventos`, `/atividades/[id]`, `/loja/atividades`, `/admin/atividades`, `/minha-conta/inscricoes`, `/minha-conta/agenda`, `/minha-conta/downloads`. **Tempo:** cinco minutos.

**Mostrar somente em homologação nesta apresentação:** criar atividade com instrutores, modalidade, local ou link, sessões, prazo, vagas e material. Publicar uma atividade gratuita, inscrever o cliente, conferir agenda e baixar o material. Mostrar revogação retirando o acesso ao material.

**Fala:** “A jornada conecta a divulgação da atividade, a inscrição, as sessões e o acesso ao material. O link de encontro e os arquivos respeitam a situação da inscrição.”

**Detalhes:** modalidades presencial, online e híbrida; instrutores com nome e biografia; atividade paga reserva vaga por 30 minutos e depende de confirmação financeira; reserva expirada permite nova tentativa; cancelamento voluntário segue sua própria regra. Edição de metadados permite completar os detalhes sem reescrever preço/vagas/sessões de uma atividade com histórico.

**Pendência de produção:** a API de atividades retorna 500 em duas verificações. Página 200 não valida inscrição. Não anunciar a jornada publicada como aprovada antes de corrigir e repetir o fluxo.

## 16 Notificações e acompanhamento

**Onde:** `/minha-conta/notificacoes`, `/loja/notificacoes`, `/admin/notificacoes` e Brevo transacional. **Tempo:** dois minutos.

**Mostrar:** aviso recebido no inbox, marcar como lido e abrir a área relacionada. Na homologação, acompanhar um evento de pedido e um evento de análise de documento.

**Fala:** “A comunicação combina caixa interna e e-mails transacionais. O sistema mantém uma fila com tentativas de reenvio e evita duplicação lógica pelo identificador do evento.”

**Limite:** há vinte modelos disponíveis, mas nem todos os eventos de inscrição, suporte, avaliação, retorno e reembolso estão conectados automaticamente. Dizer exatamente quais eventos foram demonstrados. Entrega real de e-mail foi confirmada pelo responsável; não alegar auditoria de todos os modelos.

## 17 Administradores permissões e auditoria

**Onde:** `/admin/administradores` e `/admin/administradores/perfis`. **Tempo:** três minutos.

**Mostrar na homologação:** configurar um dos cinco perfis, conceder permissão com escopo/validade e entrar com operador limitado. Demonstrar acesso permitido e recusado; revogar a concessão e repetir a operação.

**Fala:** “As permissões limitam o que cada operador pode consultar e alterar. Há escopos por loja onde o recurso suporta esse filtro, validade, revogação e registros de auditoria.”

**Limite:** alguns recursos globais ainda exigem concessão global; não prometer filtragem por loja em todas as telas. Superadministrador exige bootstrap explícito, não é concedido automaticamente a contas antigas.

## 18 Relatórios CSV e XLSX

**Onde:** `/admin/relatorios`. **Tempo:** quatro minutos.

**Mostrar na homologação:** escolher período/situação/loja, exportar o mesmo conjunto em CSV e XLSX e abrir os arquivos. Conferir um pedido de demonstração e suas colunas financeiras. Tentar exportar com operador sem a permissão necessária.

**Fala:** “Os relatórios usam os dados dos domínios responsáveis e aplicam filtros e permissões no servidor. As exportações permitem conferir a operação e o cálculo financeiro sem inventar repasses realizados.”

| Categoria | Visões disponíveis |
|---|---|
| Produtos e estoque | Produtos e quantidades por SKU |
| Vendedores | Cadastro operacional e situação |
| Clientes | IDs, situação e verificação, sem exportar dados pessoais desnecessários |
| Cursos e eventos | Atividades, sessões e inscrições |
| Faturamento e comissões | Vendas e itens |
| Pedidos | Pedidos principais |
| Pagamentos taxas e repasses | Pagamentos, preparações de estorno e repasses previstos |
| Avaliações e favoritos | Avaliações e favoritos |
| Cupons | Cupons cadastrados |
| Atendimentos | Contatos, devoluções, reclamações e disputas |

**Detalhes:** vinte subvisões em dez categorias; limite de dez mil linhas por arquivo com erro explícito; reduzir o período quando necessário. Relatórios financeiros exigem permissão operacional e financeira. Campos que possam virar fórmulas são tratados na exportação. Repasse não integrado permanece identificado como tal.

## 19 Contato atendimento analytics e consentimento

**Onde:** `/contato`, `/admin/contatos`, `/admin/analytics` e preferências de privacidade. **Tempo:** quatro minutos.

**Mostrar na homologação:** enviar contato fictício, receber protocolo, abrir a mensagem administrativa e registrar o estado de atendimento. Com consentimento, consultar o evento de contato confirmado e demonstrar retirada de consentimento.

**Fala:** “O contato gera protocolo persistente. A medição própria distingue clique de envio confirmado e depende de consentimento. Os eventos ajudam a acompanhar o funil sem substituir a contabilidade.”

**Eventos implementados:** page_view, view_item, add_to_cart, begin_checkout, sign_up, seller_application, contact_click, contact_submit, view_activity, enroll, download e purchase. A compra é confirmada no servidor; não criar eventos falsos pelo navegador.

**Limites:** tags externas permanecem desativadas por decisão do responsável; retenção técnica de 30 dias; download mede solicitação, não leitura do material; a caixa de contato não comprova envio de uma resposta por e-mail. Recusa/retirada de consentimento deve ser respeitada.

## 20 Políticas versionadas e aceites

**Onde:** `/admin/documentos-legais`, `/termos`, `/privacidade`, `/cookies`, `/compra-troca-cancelamento`, `/adesao-parceiro`. **Tempo:** dois minutos.

**Mostrar na homologação:** criar rascunho de exemplo, publicar, registrar aceite e demonstrar nova versão. Explicar que o aceite guarda versão/hash e não é reescrito quando o texto muda.

**Fala:** “A administração publica apenas versões revisadas e aprovadas. O usuário consegue consultar o documento vigente e registrar o aceite correspondente.”

**Limites atuais:** cinco políticas ainda sem conteúdo publicado em produção; não inserir texto fictício no ambiente real. Aceite obrigatório do cliente em cadastro/compra ainda não está integrado de ponta a ponta.

## 21 SEO redirecionamentos e operação conjunta

**Onde:** robots, sitemap, páginas públicas e documentação técnica. **Tempo:** dois minutos.

**Mostrar:** sitemap/robots disponíveis e explicar canonical/dados estruturados. Demonstrar o alias 301 já implementado somente após verificar seu destino. Exibir diagrama verbal: “Frontend na Vercel, gateway e quatro serviços no Render, um banco com quatro schemas.”

**Fala:** “Os serviços mantêm suas responsabilidades mesmo hospedados na mesma unidade. A API tem uma entrada pública e os caminhos internos ficam protegidos. A documentação preserva o caminho de retorno.”

**Limites:** inventário de URLs antigas existe, mas os novos destinos 301 históricos ainda dependem de aprovação; não afirmar redirecionamento integral. Consolidação não comprova SLA/capacidade do plano. Backup/restauração local foi ensaiado; produção, MFA, rotação e carga contratual exigem evidência específica.

## Encerrar com transparência

Fala sugerida: “A base do marketplace, as áreas de operação e as regras de segurança estão implementadas e possuem testes. Hoje confirmamos as páginas públicas, a API de catálogo, a proteção de acesso e o recebimento de e-mails. Ainda precisamos corrigir a API publicada de cursos, concluir configurações e conteúdo real e homologar as áreas autenticadas em produção. O gateway financeiro permanece fora desta etapa.”

Registrar os próximos itens com responsável: falha de atividades e migrations; revisão/desativação do produto de teste; publicação dos termos aprovados; configuração de atributos/documentos/entrega; homologação com os três perfis; confirmação do ciclo completo de senha; integrações externas e evidências operacionais restantes.

## Perguntas frequentes na apresentação

| Pergunta | Resposta objetiva |
|---|---|
| Já podemos receber pagamentos reais e fazer split? | Não nesta etapa; cálculo e preparação existem, gateway e movimentação real estão fora |
| As lojas veem os pedidos umas das outras? | O isolamento foi provado localmente; mostrar a negativa em homologação e completar a homologação com contas reais |
| O e-mail já funciona? | O responsável confirmou recebimento pela Brevo; falta registrar o ciclo completo de redefinição em produção |
| Cursos já funcionam no site publicado? | A implementação passa localmente, mas a API publicada está retornando 500 |
| A nota fiscal é emitida aqui? | São anexos privados; emissão fiscal externa ainda não está integrada |
| Os repasses no relatório já foram pagos? | Não; o estado de integração e os valores previstos ficam explícitos |
| Todos os documentos legais estão aprovados? | Não; não há versões publicadas nas cinco consultas de produção verificadas |
| Está garantido para mil usuários simultâneos? | Não há prova de carga representativa em produção nem garantia decorrente dos testes locais |
| O treinamento do contrato já foi entregue? | Este roteiro prepara a apresentação; a sessão de quatro horas, presença e gravação precisam ocorrer e ser registradas |

## Percurso resumido de quinze minutos

1. Vitrine, catálogo e produto — três minutos.
2. Conta e recuperação pela Brevo — dois minutos, sem expor o link.
3. Produto/estoque e pedido de duas lojas já preparado em homologação — três minutos.
4. Permissões, relatórios e atendimento — três minutos.
5. Cursos em homologação, documentos e políticas — dois minutos.
6. Pendências objetivas e próximos responsáveis — dois minutos.

Este roteiro não substitui a homologação funcional nem comprova treinamento ministrado. Usar o relatório de validação como anexo e registrar separadamente as demonstrações efetivamente realizadas.
