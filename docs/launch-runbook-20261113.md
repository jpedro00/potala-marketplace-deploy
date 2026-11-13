# Publicação e operação — complemento de 13/11/2026

Este roteiro não foi executado em produção. Referências: `remaining-contract-results-20261113.md`, `manual-marketplace-20261110.md`, `deploy/render/ROLLBACK.md` e os procedimentos de backup em `ops-validation-20261111.md`.

## Preparar a versão

1. Registrar commits de frontend/backend, imagem/release anterior, responsável pelo corte e contatos técnicos. Inventariar titulares de GitHub, Vercel, Render, domínio/DNS, Supabase, armazenamento e remetente Brevo em registro privado. Confirmar MFA e recuperação das contas com seus titulares; não registrar segredos no repositório.
2. Registrar plano/custo/limites vigentes de cada fornecedor e responsável pelo pagamento. A consolidação não prova que plano gratuito suporta a carga contratual. Não comprar planos ou habilitar cobranças como efeito deste roteiro.
3. Ensaiar a versão em banco e URLs de homologação; executar os casos listados no relatório. Configurar perfis administrativos sem compartilhar superadministrador. Testar pelo menos comprador, dono de loja, funcionário sem privilégio financeiro e administrador com escopo limitado.
4. Confirmar backup recente com todos os schemas, objetos e migrations, retenção diária de 30 dias, armazenamento separado e restauração medida em destino novo. O Anexo exige RPO até 24 horas e RTO até oito horas: registrar medições reais, sem inferir aprovação do ensaio local.
5. Revisar as migrations novas nos quatro domínios. Aplicar sequencialmente `prisma migrate deploy` em cada diretório de serviço, com suas próprias DATABASE_URL/DIRECT_URL obtidas do cofre. Não usar `db push`, seed de exemplo ou `migrate reset` no banco real. A imagem de runtime não aplica migrations automaticamente.

## Configurar e publicar

- Preservar bancos e chaves internas existentes. O supervisor atribui as URLs loopback; Sellers agora também consulta Catalog para confirmar a adesão vigente. A lista autorizada de variáveis está em `deploy/render/env.example`.
- Recuperação de conta exige `IDENTITY_NOTIFICATION_ENCRYPTION_KEY`, origem correta e remetente/chave Brevo aprovados. A chave de criptografia deve sobreviver aos reinícios. Não ativar confirmação obrigatória antes de testar recebimento e retorno do link. Não atribuir credenciais fictícias para contornar indisponibilidade.
- Workers de inbox: `SELLERS_SELLER_NOTIFICATION_DISPATCH_ENABLED=true` e `ORDERS_ORDER_NOTIFICATION_WORKER_ENABLED=true`. Worker de e-mail separado: `IDENTITY_NOTIFICATION_DISPATCH_ENABLED=true`, somente com provedor e remetente homologados. Inbox registrado não significa e-mail entregue.
- Configurar documentos exigidos e publicar apenas textos legais aprovados. Testar envio, correção, aprovação e versão do aceite. Não publicar os textos fictícios do banco local.
- Cada loja configura retirada ou tabela de entrega. Sem configuração, o checkout físico fica indisponível para aquele destino. Transportadora externa e emissão fiscal continuam pendentes; anexar documento não emite nota.
- Gateway financeiro permanece fora desta etapa e indisponível no runtime de produção. O mock exige simultaneamente NODE_ENV=test e modo mock; nunca habilitar em produção.
- Publicar backend compatível, verificar readiness e só então o build do frontend apontando à origem/API correta. Manter uma janela coordenada para clientes com páginas antigas. Não alterar o instituto.

## Homologar e monitorar

Registrar respostas e evidências sem dados pessoais: login/logout, fluxo real de e-mail, cadastro de parceiro/documentos/aceite, busca/filtros, preços, frete, relatórios CSV/XLSX, curso/inscrição/material, contato confirmado e autorização negativa entre lojas. Compras reais permanecem bloqueadas enquanto o pagamento estiver fora do escopo operacional.

Monitorar readiness, erros 5xx, latência, limite 429, filas pendentes/falhas/leases e eventos de reconciliação. Configurar alertas com responsável e escalonamento. Probes não comprovam disponibilidade mensal de 99,5%. Medir LCP p75 no ambiente publicado e executar carga representativa autorizada, sem repetir o teste de mil requisições pelo mesmo IP como prova de mil usuários.

## Retornar se necessário

Pausar mutações e drenar requisições antes da troca. Desligar workers novos para interromper os consumos; preservar jobs para retomada. Restaurar a imagem anterior e a versão compatível do frontend, usando as configurações privadas registradas. As migrations desta etapa são aditivas: manter tabelas, anexos, aceites e auditoria; não apagar dados para imitar a versão antiga. Conferir pedidos aceitos, estoque e sessões antes de reabrir. Nunca restaurar backup antigo por cima de vendas novas sem reconciliação e decisão explícita.

Para voltar aos serviços originais, seguir o inventário e `deploy/render/ROLLBACK.md`, garantindo apenas um conjunto gravando e um destino de webhook. Disponibilidade dessas instâncias precisa ser confirmada antes do corte; código recuperável não significa infraestrutura ativa.

## Treinamento e entrega

O manual existente contém roteiro de capacitação. Incluir agora documentos de parceiros, políticas versionadas, configuração de entrega, anexos fiscais, atributos e notificações. Agendar as quatro horas para até dez pessoas, registrar presença, gravação e dúvidas; entregar acessos individuais e responsáveis pela operação. Preparar o roteiro não comprova treinamento ministrado.
