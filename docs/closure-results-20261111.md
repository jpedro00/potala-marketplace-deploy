# Resultado das sete correções solicitadas — 11/11/2026

Escopo: marketplace, mantendo institucional fora da substituição. Base: backend 03f4ce9 e frontend 7599e39. As alterações desta rodada ainda são de implementação/homologação local; não foram implantadas na produção. Usuário definiu medição própria com tags externas desativadas e dispensou a solicitação de novas conexões aos provedores.

| Solicitação | Resultado verificável | Situação restante |
|---|---|---|
| 1. Relatórios contratados | Vinte subvisões organizadas em dez categorias: produtos/estoque, vendedores, clientes, cursos/eventos/inscrições, faturamento/comissões, pedidos, pagamentos/taxas/estornos/repasses previstos, avaliações/favoritos, cupons e atendimentos. CSV/XLSX, filtros e isolamento validados; financeiro exige concessões operacional e financeira com interseção dos escopos | Pronto local. Aprovação comercial da apresentação/limites e publicação pendentes. Nenhum repasse real é inventado; estado NOT_INTEGRATED explícito |
| 2. Instrutores/modalidade/local/link | Dados estruturados e formulários; publicação exige dados consistentes; link privado só para acesso autorizado; edição de metadados permite completar atividades com histórico sem mudar preço, vagas, sessões ou inscrições | Pronto local. Conteúdo real/migração editorial e homologação publicada pendentes |
| 3. Inventário e 301 | Domínio legado real `www.institutopotala.com`, 523 URLs descobertas e 30 páginas verificadas; alias interno existente demonstrado com HTTP 301 | Parcial. Não há correspondência aprovada para novas páginas reais de marketplace; zero novos 301 históricos aplicados. Não redirecionar páginas institucionais ativas para destinos genéricos |
| 4. Tags e contato confirmado | Decisão explícita de medição própria e tags externas desativadas registrada; formulário, protocolo persistente, caixa administrativa, auditoria e evento contact_submit somente após gravação. Retry não duplica; consentimento/retirada respeitados | Pronto local, incluindo prova navegador → API → banco. Não afirma envio de e-mail/Brevo; notificações continuam entrega distinta |
| 5. Produtos e fixture | Consulta pública real revisou cinco produtos; fixture exata identificada; script de desativação reversível com conferência de ID/título/slug e fotografia anterior preparado | Revisão realizada; desativação em produção não executada sem sessão administrativa verificada. Cristais continua com URL de página no campo imagem, e o livro sem foto precisa de material aprovado |
| 6. Publicar e homologar | Migrations aditivas, build dos cinco serviços e frontend e smoke local integrado aprovados; sequência e retorno documentados | Não executado em produção. Vercel conectado retorna 403 para o time Potala; Supabase conectado não lista o projeto real. Sem backup/restauração desse banco e bootstrap do administrador, não promover a branch nem disparar publicação pela main |
| 7. Backup/carga/desempenho/MFA/segredos | Dump/restauração reais em banco separado, contagens e FKs comparadas; LCP local e dois cenários de carga executados; auditorias de dependências sem achados conhecidos | Parcial. Backup é de banco descartável, não produção. Carga de mil usuários de um único IP não passou; MFA/rotação não foram verificados/executados; RPO/RTO/retensão/SLA de produção não comprovados |

## Testes e integração

| Componente | Testes aprovados |
|---|---:|
| Identity | 115 |
| Sellers | 115 |
| Catalog, incluindo provas PostgreSQL | 299 |
| Orders | 632 |
| Gateway | 75 |
| **Total dos serviços** | **1.236** |
| Supervisor/configuração/guardas operacionais | 10 adicionais |

Logs finais em `artifacts/closure-{identity,sellers,catalog,orders,gateway}-final-tests.log` e `closure-runtime-final-tests.log`; Catalog foi repetido após a revisão em `closure-catalog-reviewed-tests.log` (299/299). Os cinco builds, build final Next, TypeScript e ESLint dos módulos frontend alterados passaram. `closure-audit-*.json`: seis auditorias npm das dependências de produção com zero vulnerabilidades conhecidas em 11/11; isso não é certificado geral de segurança.

Smoke real de cinco processos: conta e sessão, duas lojas, produtos, checkout simulado com split em centavos, idempotência, estoque e isolamento; CSV/XLSX e novas visões acessando seus domínios via HTTP interno autenticado; cadastro/publicação de curso estruturado, inscrição e material; contato persistido com retry, negação ao cliente no admin e evento confirmado no servidor. Nenhuma cobrança real foi tentada.

Chrome local: envio pela página `/contato`, gravação confirmada no PostgreSQL, um evento `contact_submit`, autenticação do administrador, consulta da mensagem e alteração auditada para READ; nenhum erro JavaScript capturado. Artefatos `closure-contact-browser.json` e `.png`. Conteúdo e contas usados são fictícios no banco isolado, não dados de produção.

## Provas operacionais e limites

- Backup/restauração: ver `ops-validation-20261111.md` e `artifacts/ops-backup-latest.json`; cluster nativo PostgreSQL 17 novo e isolado, endereço/porta/banco e data_directory validados, restauração em banco novo sem sobrescrever origem.
- LCP: trinta amostras válidas em Chrome, home/catálogo/cursos, desktop/celular. P75 por perfil entre 296 ms e 960 ms, todos abaixo de 3 s. Máquina local, sem throttling de rede/CPU e sem p75 de campo: não prova o critério no Render/Vercel publicados nem a matriz Safari/Firefox/Edge.
- Carga pequena: cinco usuários, dez segundos, 48/48 respostas 200; p95 28,40 ms.
- Carga de mil usuários: trinta segundos, ramp de dez segundos, **um gerador e um IP**, 25.192 requisições: 169 respostas 200, 24.979 respostas 429 e 44 respostas 503 de readiness; sem erro de rede do cliente. Latência geral é dominada por bloqueios rápidos, não demonstra desempenho útil para mil clientes.
- Limites não foram elevados. Todos compartilharam os orçamentos por IP. Serviços responderam 200 após a janela de bloqueio. O código também permite que throttling do health de um domínio seja refletido como 503 pelo gateway; sem logs correlacionados não atribuir cada 503 a essa causa. O ensaio não comprova mil IPs/sessões autenticadas nem incapacidade definitiva da infraestrutura.
- MFA e rotação: não verificados/executados. Foram inspecionados somente metadados locais, sem imprimir segredos. Mudança de credencial exige acesso ao provedor e atualização coordenada de todos os consumidores; não foi substituída por checklist.

## Implantação e retorno

Conferir alvo e versões, obter backup restaurável de produção e registrar o administrador responsável; aplicar migrations, executar bootstrap explícito do ADMIN existente e configurar concessões, então publicar backend e frontend e repetir testes autenticados. Não promover somente o frontend contra o backend antigo. O provedor financeiro real permanece bloqueado até integração própria.

O retorno de código conserva tabelas novas; não apagar migrations/tabelas para reverter. Pagamentos e inscrições criados durante uma atualização exigem conciliação própria. A desativação da fixture é reversível por reativação, preservando pedidos. Os procedimentos preparados não são prova de que uma mudança produtiva ocorreu.

## Revisão

Revisão cruzada identificou e corrigiu: falta de edição de novos metadados em curso com histórico; hostname local com ponto final aceito no link; conteúdo de contato/link privado em logs debug; exportação financeira acessível apenas com concessão operacional. Testes de regressão incluídos nos totais acima. A revisão final independente apontou ainda divergência de caixa de UUID nos locks de consentimento e formulário de instrutores desatualizado após edição paralela. Ambos foram reproduzidos em regressões vermelhas e corrigidos; provas PostgreSQL e navegador ficaram verdes. A revisão independente foi interrompida pelo limite do serviço após reportar esses achados; não representa certificação exaustiva.
