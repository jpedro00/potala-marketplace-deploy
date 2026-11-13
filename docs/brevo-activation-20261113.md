# Ativação da Brevo — marketplace

Arquitetura já implementada: frontend solicita recuperação/confirmação ao Identity; token de uso único é salvo com hash e link criptografado entra na fila; o worker envia pela API HTTPS da Brevo. Pedidos e parceiros publicam eventos na caixa interna do usuário. Nenhuma chave pertence ao frontend.

## Configurar a conta

Na Brevo, habilitar o envio transacional, cadastrar/verificar o remetente e autenticar o domínio com os registros fornecidos pelo próprio painel. Criar uma chave **API**, não uma chave SMTP. O código usa `POST https://api.brevo.com/v3/smtp/email` com o header `api-key`, conforme [documentação de envio](https://developers.brevo.com/reference/send-transac-email). A conta/remetente real não foi acessada por esta entrega.

Na chave restrita, usar E-mails transacionais: Todos e Conta: Lidas (para a consulta de remetentes); demais recursos: Nenhum. Não gravar credenciais em mensagens, documentação ou Git. Credenciais divulgadas devem ser substituídas nos ambientes correspondentes; a rotação da chave de criptografia precisa considerar previamente links ainda na fila.

## Variáveis no Render

No serviço consolidado do marketplace, abrir Environment e configurar:

| Variável | Valor |
|---|---|
| `IDENTITY_BREVO_API_KEY` | Chave API privada da conta Brevo |
| `IDENTITY_BREVO_SENDER_EMAIL` | `projetopotala@gmail.com`, informado pelo responsável; conferir status ativo na Brevo |
| `IDENTITY_NOTIFICATION_ENCRYPTION_KEY` | Chave privada estável de 32 bytes aleatórios codificados em base64 |
| `IDENTITY_ACCOUNT_ACTION_ORIGIN` | `https://marketing-place-potala.vercel.app` enquanto essa for a origem pública do frontend |
| `IDENTITY_NOTIFICATION_DISPATCH_ENABLED` | `true` após verificar a configuração |
| `SELLERS_SELLER_NOTIFICATION_DISPATCH_ENABLED` | `true` para eventos de parceiros |
| `ORDERS_ORDER_NOTIFICATION_WORKER_ENABLED` | `true` para eventos de pedidos |
| `IDENTITY_REQUIRE_EMAIL_CONFIRMATION` | Inicialmente `false`; habilitar somente após homologar recebimento/retorno do link |

`FRONTEND_URL` deve coincidir com a origem acima. Gerar a chave de criptografia em ambiente privado com um gerador criptográfico/cofre, preservar durante redeploys e nunca colar segredos no chat, Git ou `NEXT_PUBLIC_*`. Não substituir uma chave de criptografia existente sem tratar a fila antiga. Os nomes prefixados são convertidos pelo supervisor para o Identity; não usar nomes sem prefixo no serviço consolidado.

## Verificar sem enviar e-mail

Com as variáveis carregadas privadamente no ambiente do processo:

```text
node deploy/render/check-brevo.mjs
node deploy/render/check-brevo.mjs --remote
```

No checkout local também é possível `npm run check:email` e `npm run check:email -- --remote`. A imagem de runtime contém o script, mas não precisa do npm/package.json da raiz. O modo remoto faz somente `GET /v3/senders` e verifica se o remetente configurado está ativo, conforme [contrato Brevo](https://developers.brevo.com/reference/get-senders). Não envia mensagens, não altera a conta, não exibe chave/lista de remetentes e não comprova entregabilidade. A saída também informa se o worker e a confirmação obrigatória estão habilitados.

## Publicar e homologar

Publicar backend e frontend compatíveis da branch de trabalho, após aplicar as migrations aditivas e cumprir o roteiro `launch-runbook-20261113.md`. Configurar as variáveis por si só não publica o código que ainda não esteja no ambiente real.

1. Usar uma conta de teste sob controle do responsável; solicitar recuperação pelo link “Esqueci minha senha”. Confirmar recebimento, domínio/origem do link, abertura da tela e redefinição. O token fica no fragmento e é removido da barra após leitura.
2. Conferir senha antiga recusada, nova aceita, sessões anteriores revogadas e reutilização do link recusada. Link de recuperação expira em 30 minutos; confirmação em 24 horas.
3. Homologar confirmação de e-mail com a conta de teste antes de ligar obrigatoriedade para novos cadastros. Contas ativas anteriores não são bloqueadas automaticamente por essa opção.
4. Conferir os eventos efetivamente conectados de pedido e análise de documentos na caixa interna e no histórico transacional Brevo. O conjunto de 20 modelos não significa que todos os eventos de negócio estejam publicados automaticamente.
5. Registrar `messageId` e recebimento real. `SENT` indica aceite pela API, não entrega/leitura. Domínio verificado, spam/bounce, quotas e bloqueios da conta exigem acompanhamento no painel Brevo; não há webhook de entregabilidade nesta etapa.

Ativar o worker pode consumir notificações antigas ainda válidas. Links expirados/já consumidos são descartados com limpeza do conteúdo criptografado antes do envio. Para interromper novos envios, definir `IDENTITY_NOTIFICATION_DISPATCH_ENABLED=false` e reiniciar a versão; preservar a fila, banco e chave de criptografia. Não executar uma rotina manual de dispatch ao mesmo tempo para tentar forçar repetição.

## Evidências desta preparação

Treze testes locais do supervisor/checker, provas de conta/filas com PostgreSQL isolado e respostas Brevo simuladas. Nenhuma conta real Brevo foi conectada, mensagem externa enviada ou variável de produção alterada. Remetente, chave privada e homologação de entrega continuam necessários para ativação real.

Na validação de 13/11/2026, Identity passou 124 testes (incluindo sete provas PostgreSQL), com build e lint dos arquivos alterados. A prova nova demonstrou o descarte de links expirados/consumidos antes do envio. O teste foi isolado dos jobs de outras jornadas locais, sem apagar suas filas.

Verificação pública na mesma data: `/api/v1/health/ready` respondeu 200 com os quatro domínios disponíveis; o frontend `/recuperar-senha` respondeu 404. A funcionalidade ainda exige publicação coordenada da versão preparada, migrations e teste real de entrega. Readiness não comprova conexão com a Brevo.
