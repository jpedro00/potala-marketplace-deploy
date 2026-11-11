# Contato confirmado e medição própria

Decisão do responsável em 11/11/2026: manter medição própria Potala e tags externas desativadas. Nenhum GTM, pixel externo ou script arbitrário foi instalado. A configuração está em `src/lib/analytics-config.ts` do frontend. Essa decisão substitui a necessidade de escolher ferramenta externa nesta etapa; não substitui aprovação das políticas legais gerais.

`/contato` recebe nome/e-mail/assunto/mensagem, limita tamanhos e inclui campo antispam. POST `/api/v1/public/contact` exige origem permitida, limita cinco requisições por minuto no handler e só confirma protocolo após a transação persistir a solicitação. Repetições da mesma chave com mesmo conteúdo não duplicam mensagens ou eventos; conteúdo diferente com a mesma chave gera conflito.

O evento `contact_submit` é exclusivo do servidor e escrito na mesma transação da mensagem. Não é permitido pelo endpoint público de eventos. Só é registrado com consentimento e sessão de medição ainda ativa; compartilha o lock de retirada de consentimento. Dados pessoais e texto da mensagem não entram no evento. `contact_click` continua separado, indicando apenas clique num canal.

Em `/admin/contatos`, atendimento global autorizado pode consultar a mensagem e marcar como lida/encerrada; mudanças geram auditoria com ator. Respostas administrativas usam no-store. Formulário não envia e-mail por si: mensagem recebida fica na caixa administrativa. Notificações Brevo e prazo operacional de resposta continuam dependências distintas.

Logs, inclusive debug não produtivo, ocultam nome/e-mail/assunto/mensagem e link privado de reunião. As mensagens contêm dados pessoais necessários para resposta e exigem política operacional de retenção e acesso aprovada. Analytics mantém sua política técnica de trinta dias.

Provas: teste PostgreSQL de quatro envios concorrentes resulta em uma mensagem e um evento, chave alterada rejeitada, retirada respeitada, status auditado; teste de DTO rejeita evento forjado. Smoke dos cinco processos confirma submissão, repetição, acesso negado ao cliente, leitura/atualização administrativa e contagem do evento de confirmação.

## Catálogo publicado

Consulta pública real de 11/11 retornou cinco produtos, incluindo a fixture exata `b84181c0-5b7f-4f5f-9645-9dd8ad2e49a2`, título `TESTE REGRESSAO Produto Seller B 1663039609`. Revisão preservada em artifacts. A imagem Cristais identificada anteriormente ainda exige correção editorial e origem de imagem válida; nenhum arquivo de imagem substituto foi inventado.

`node deploy/validation/review-products.mjs` apenas lê. `--apply` exige sessão administrativa fornecida via variável de ambiente, confere ID/título/slug exatos, salva a fotografia anterior e desativa reversivelmente, preservando vínculos/pedidos. Não foi executado em produção por falta de acesso administrativo verificado; não declarar a fixture removida. Segredos não são aceitos em argumentos nem impressos. Para retornar, reativar o mesmo produto autenticado.
