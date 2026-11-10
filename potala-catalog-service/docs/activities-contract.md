# Atividades, inscrições e materiais

O Catalog é dono de Activity, ActivitySession, Enrollment, ActivityMaterial e MaterialAccess. Seller/user/order IDs são referências entre domínios sem FK. Migrations aditivas: `20261110120000_activities`; analytics usa migration separada. Nunca aplicar migration em produção durante desenvolvimento.

## Rotas

Todas têm prefixo `/api/v1`. O gateway expõe somente rotas públicas/autenticadas; `/internal` fica restrito à rede de serviços e exige `x-internal-api-key` configurada.

- GET `/activities?kind=COURSE|EVENT|RECURRING`, GET `/activities/:id`: somente publicadas, sessões sem conteúdo de materiais.
- POST `/activities/:id/enroll`: identidade da sessão; corpo não controla usuário, valor, seller ou status.
- GET `/me/enrollments`; POST `/me/enrollments/:id/cancel`: somente usuário proprietário.
- GET `/me/enrollments/:id/materials`; GET `/me/enrollments/:id/materials/:materialId/download`: proprietário confirmado e atividade publicada. Resposta download é TXT, attachment, private/no-store e nosniff; MaterialAccess registra cada entrega autorizada.
- GET/POST `/seller/activities`; PUT/PATCH `/seller/activities/:id`; POST `/seller/activities/:id/materials`; GET `/seller/activities/:id/enrollments`; POST `/seller/activities/:id/enrollments/:enrollmentId/revoke`: seller resolvido por guard de membership ativo, ownership no serviço.
- Mesmo contrato `/admin/activities` com permissões `catalog:activity:read/manage` e `catalog:enrollment:read/manage`, escopo PLATFORM.
- PUT substitui cadastro/programação somente em rascunho sem inscrições; PATCH recebe `{status:DRAFT|PUBLISHED|CANCELLED}`. Cancelamento é terminal e revoga inscrições. Suspensão (DRAFT) impede novos acessos enquanto suspensa.
- POST material recebe `{title,filename,content}`; nome ASCII de até 80 caracteres com extensão `.txt`; conteúdo até 1 MB. Conteúdo textual fica no banco. Não existem URLs externas ou proxy de URL: nenhuma oportunidade de SSRF, segredo em URL ou fornecedor novo.

## Pagamento entre domínios

GET `/internal/activities/enrollments/:id` retorna `{id,userId,activityId,sellerId,priceCents,status,expiresAt,title}`. sellerId pode ser null para organização própria da plataforma.

Orders recebe POST `/me/activity-payments` `{enrollmentId}` e resolve snapshot autoritativo (nunca preço/seller do browser). Após aprovação efetiva do provedor ou simulação explicitamente permitida no ambiente de teste, chama POST `/internal/activities/enrollments/:id/payment` com `{orderId,userId,amountCents,status:CONFIRMED|REVOKED}`. Orders é responsável pela autenticidade do webhook e associação entre pedido/usuário/inscrição. Catalog exige igualdade de userId/valor, orderId único e estável, inscrição paga, reserva válida e atividade publicada. REVOKED só aceita o mesmo orderId previamente vinculado.

Sem adaptador financeiro real, pagamento permanece indisponível e inscrição paga não concede material. Reservas duram até 30 minutos, limitadas pelo prazo de inscrição. Inscrição/confirm/cancel/revoke/download são serializados por lock de linha da atividade em transação. Reservas expiradas são canceladas antes de contar vagas e ao consultar inscrições. Não há worker obrigatório para liberar capacidade: toda nova tentativa recalcula sob lock. Confirmação tardia é recusada, exigindo que Orders/provedor trate estorno; não reabre vaga de outra pessoa. Retry confirmado do mesmo pedido é idempotente.

Cancelamento/revogação de participação não é confirmação de estorno financeiro. A equipe deve tratar estorno na operação financeira; o frontend comunica essa condição ao revogar. Inscrição cancelada é terminal; para repetir uma turma, criar nova atividade. A edição de rascunhos com inscrições é bloqueada para manter preço/programação contratados.

## Datas e operação

API exige ISO 8601 com offset/Z, deadline futuro e anterior ao início de todos os encontros; encontros com fim posterior ao início, sem sobreposição. Fuso IANA é validado por Intl. Instantes ficam em UTC e são exibidos no fuso da atividade. O formulário informa que datetime-local usa o fuso do dispositivo na entrada.

Páginas: `/cursos`, `/eventos`, `/atividades`, `/atividades/:id`, `/minha-conta/inscricoes`, `/minha-conta/agenda`, `/minha-conta/downloads`, `/loja/atividades`, `/admin/atividades`. Navegação adicionada aos shells existentes. Os eventos opcionais enroll/download usam a política central de consentimento; conteúdo privado/identidade não entra nos eventos.

## Provas

`npm test -- --runInBand activities`: 11 testes unitários e 4 testes reais opt-in PostgreSQL. Para integração, provisionar/migrar banco descartável e definir `ACTIVITIES_TEST_DATABASE_URL`; fixtures próprias são apagadas ao final. Provas incluem limite concorrente de duas vagas/12 tentativas, retry de um usuário/8 tentativas, expiração, callback tardio, owner de download, pagamento confirmado, cancelamento e auditoria. Executado em 10/11/2026 contra PostgreSQL descartável local 127.0.0.1:55434: 15/15 passaram. Build Catalog e TypeScript frontend passaram. Nenhuma migration foi aplicada em banco publicado.

Limites de listagem atuais: 200 atividades/inscrições e 500 participantes por consulta; paginação para volumes superiores deverá ser acrescentada antes de operar além desses limites. Material suporta TXT; arquivos binários privados exigirão armazenamento adicional e política de entrega equivalentes.
