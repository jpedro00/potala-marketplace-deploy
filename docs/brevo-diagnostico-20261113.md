# Diagnostico de envio Brevo — 13/11/2026

## Evidencia

A chave fornecida privadamente no arquivo local foi usada somente em GET /v3/senders. A Brevo retornou HTTP401, codigo unauthorized e mensagem classificada como restricao de IP. A chave tinha formato de chave API, sem espacos externos. Nenhuma mensagem foi enviada e nenhum segredo/endereco IP da resposta foi registrado. Isto comprova o bloqueio deste computador, nao comprova que o Render esteja bloqueado pela mesma regra.

Nao ha conector Brevo/Render habilitado. A conexao Supabase lista somente outro projeto, que nao foi acessado para esta tarefa. A fila de producao e as permissoes da conta nao foram alteradas.

## Correcao na aplicacao

O worker antes ocultava a causa de recusa da API. Agora registra apenas evento, motivo controlado, status HTTP, tentativa e indicacao de retry, sem destinatario, link, chave ou corpo do provedor. As categorias incluem BREVO_IP_NOT_AUTHORIZED, BREVO_AUTH_REJECTED, BREVO_ACCESS_DENIED, BREVO_RATE_LIMIT e falha generica de processamento. O inicio do worker tambem gera log explicito. A politica de retry e os tokens privados foram preservados. Isso melhora o diagnostico; nao autoriza IPs nem corrige credenciais da conta por conta propria.

Validacao: 125 testes Identity aprovados, incluindo sete provas PostgreSQL locais e regressao especifica que reproduziu ausencia de diagnostico antes da correcao. A regressao confirma motivo IP/HTTP401, manutencao do retry e ausencia de segredo/destinatario/token nos logs. Build e lint dos tres arquivos de codigo alterados aprovados. Nenhuma nova migration e necessaria para esses logs.

## Completar a verificacao em producao

1. Executar `brevo-diagnostico-20261113.sql`, somente leitura. Nenhuma linha de recuperacao pode significar conta inexistente/inelegivel ou pedido nao gravado; QUEUED com zero tentativas sugere worker parado/configuracao; FAILED exige diagnosticar recusas/expiracao; SENT registra somente aceite Brevo.
2. Publicar a versao com os logs e consultar `brevo_send_failed` no Render. Confirmar a mensagem `Brevo notification worker enabled`. Nao deduzir restricao no Render apenas do teste local.
3. Se o Render tambem tiver bloqueio de IP, abrir o servico no Render: Connect > Outbound, e conferir seus IPs/faixas de saida. Na Brevo: Settings > Security > Authorized IPs, conferir as tentativas bloqueadas e autorizar somente as origens reconhecidas. Nao liberar origens desconhecidas nem desligar globalmente a protecao. A alteracao de acesso fica a cargo do titular enquanto nao houver acesso automatizado autorizado ao painel.
4. Depois da correcao da conta, solicitar um novo link com uma conta cadastrada controlada pelo responsavel; nao reutilizar link expirado ou republicar tokens antigos. Conferir fila, aceite no provedor e recebimento.

Referencias: [IPs de saida do Render](https://render.com/docs/outbound-ip-addresses), [Autorizacao de IPs na Brevo](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security).
