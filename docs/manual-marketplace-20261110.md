# Operação do marketplace Potala

Versão em preparação de 10/11/2026. Aplicável à branch `feature/marketplace-completion-20261110`. Não descreve funcionalidades publicadas. Instituto fora deste pacote.

## Administração

Um operador técnico deve executar o bootstrap explícito documentado em `marketplace-admin-access-reports-20261110.md` para um ADMIN ativo, após aplicar as migrations. Sem isso, contas antigas não recebem permissões automaticamente. O superadministrador configura até cinco perfis, permissões, escopo global ou por lojas e validade. Revogar uma concessão retira a autorização nas requisições seguintes; cada alteração gera auditoria transacional. Nunca compartilhar credenciais de administrador.

Em `/admin/relatorios`, escolher uma das dez visões, período, situação e loja quando disponível. CSV e XLSX são gerados pelo servidor com os mesmos filtros e autorização. O limite de 10.000 linhas gera erro explícito; dividir o período, sem presumir que o arquivo está completo. Campos que parecem fórmulas são neutralizados no CSV e tratados como texto no XLSX. Não reenviar exportações contendo dados de clientes sem necessidade operacional.

Em `/admin/financeiro`, configurar políticas comerciais aprovadas: comissão, percentual do gateway e tarifa fixa, com escopo produto, categoria, vendedor ou plataforma. A precedência é nessa ordem. Percentuais usam pontos-base: 100 = 1%. Valores usam centavos: 100 = R$ 1,00. A tarifa fixa é aplicada por linha de pedido, não por unidade ou por checkout. Validar essa convenção com o gateway escolhido. Cada alteração cria uma versão e compras preservam o retrato financeiro original. Nenhuma taxa comercial foi presumida como aprovada.

Um estorno preparado reserva o saldo reembolsável e usa chave de idempotência. Não significa dinheiro devolvido: a execução e conciliação reais dependem do adaptador financeiro. Não repetir com outra chave para contornar erro de comunicação. Verificar eventos `PAYMENT_RECONCILIATION_REQUIRED` antes de considerar um pagamento resolvido.

Em `/admin/atividades`, criar cursos, eventos e agendas recorrentes, sessões, prazo, vagas e materiais; publicar após conferir os dados. Atividades pagas pertencem a uma loja e devem ser cadastradas no painel dessa loja. A administração pode moderá-las. Revogação retira o acesso aos materiais. Cancelar inscrição ou acesso não executa estorno bancário automaticamente.

Em `/admin/analytics`, consultar contagens por evento, sessões e valor de compras confirmadas, com período. Os números abrangem apenas participantes que consentiram e eventos recebidos; não substituem os relatórios financeiros. `contact_click` mede clique; `download` mede solicitação de download, não leitura do material. Retenção técnica de 30 dias. Aprovação dos textos legais e política de retenção continua necessária.

## Vendedor

Em configurações de pagamentos, o proprietário escolhe os meios aceitos e cadastra a identificação mínima do recebedor. Não inserir senha bancária, token secreto, número completo de cartão ou CVV. O cadastro não verifica nem habilita o recebedor no provedor; isso dependerá do onboarding do gateway. Funcionários não podem assumir a titularidade financeira.

Revisar título, descrição, categoria, preço, estoque, variações e fotos antes de publicar produtos. Usar URL direta de imagem, não URL de uma página HTML. Conferir visualização pública e remover produtos de teste pelo painel após verificar que não há vínculos operacionais relevantes.

Em `/loja/atividades`, cadastrar e publicar a atividade e suas sessões. Enviar materiais PDF, PNG, JPEG ou TXT com até 5 MiB e nome simples. O servidor valida tamanho, assinatura e MIME, exige inscrição confirmada e entrega como anexo. A validação de conteúdo é restrita e não equivale a antivírus/CDR; mantenha a origem dos materiais confiável. Conferir participantes antes do evento.

## Cliente

Consultar `/cursos` e `/eventos`, abrir a atividade e inscrever-se autenticado. Inscrições gratuitas confirmam dentro das vagas. As pagas reservam vaga por 30 minutos e dependem de confirmação financeira. Uma reserva expirada permite nova tentativa com nova inscrição. Cancelamento voluntário não é uma reserva expirada. Consultar `/minha-conta/inscricoes`, `/minha-conta/agenda` e `/minha-conta/downloads`. Material pago só fica disponível após confirmação válida e deixa de estar disponível quando o acesso é revogado.

O checkout real fica indisponível até existir adaptador de gateway. Não testar cobrança real esperando aprovação simulada. O mock só funciona com ambiente `test` e modo `mock` explícitos.

Nas preferências de privacidade, permitir ou recusar medição. Recusar interrompe novos eventos locais e solicita exclusão dos eventos da sessão. Sem conexão, a exclusão permanece pendente e é repetida na próxima visita/conexão; confirmação tardia de compra só é excluída no servidor depois que a retirada chega a ele.

## Implantação e retorno

1. Fazer backup e testar restauração em ambiente isolado; registrar o commit atual de cada repositório.
2. Homologar o conjunto completo e revisar os resultados de segurança. Não colocar `PAYMENT_GATEWAY_MODE=mock` em produção.
3. Aplicar migrations aditivas Identity, Sellers, Catalog e Orders; executar bootstrap do superadministrador e conferir acessos.
4. Publicar o pacote backend, verificar readiness dos quatro domínios, depois publicar o frontend. Configurar política comercial e preferências; sem gateway real o pagamento deve continuar bloqueado.
5. Validar conta cliente, proprietário, funcionário e administrador restrito, CSV/XLSX, curso gratuito e negativas de autorização.
6. Para retornar, restaurar os commits anteriores de frontend e backend, preservando tabelas novas. Não executar drop/rollback destrutivo de schema. Verificar compatibilidade e consistência dos pedidos gerados desde a mudança; reverter código não desfaz transações financeiras. Em caso de divergência, interromper novas cobranças e reconciliar antes de restaurar dados.

Gateway ainda requer credenciais por ambiente, onboarding/KYC, tokenização, Pix/cartão, assinatura e replay de webhook, idempotência externa, split efetivo, antifraude, estorno, chargeback e conciliação. A camada preparada não substitui homologação com o provedor.
