-- SOMENTE LEITURA. Nao retorna e-mails, links, tokens nem conteudo criptografado.
-- Executar no SQL Editor do banco Potala para distinguir fila vazia, worker inativo e rejeicao.
SELECT template, status, count(*) AS quantidade,
 min(attempts) AS menor_tentativa,max(attempts) AS maior_tentativa,
 max("createdAt") AS ultimo_pedido,max("sentAt") AS ultimo_aceite_brevo
FROM identity."Notification"
WHERE "createdAt" > now() - interval '24 hours'
GROUP BY template,status ORDER BY template,status;

SELECT template,status,attempts,"createdAt","nextAttemptAt","lockedUntil","sentAt",
 ("providerMessageId" IS NOT NULL) AS brevo_aceitou,
 ("encryptedPayload" IS NOT NULL) AS payload_ainda_na_fila
FROM identity."Notification"
WHERE template IN ('PASSWORD_RESET','EMAIL_CONFIRMATION')
ORDER BY "createdAt" DESC LIMIT 10;
