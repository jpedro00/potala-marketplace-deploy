# Validação do marketplace Potala

Verificação de 13 de novembro de 2026, aproximadamente 13h26 a 13h30 de Brasília. Escopo exclusivo do marketplace. O Instituto não integra esta avaliação. Gateway de pagamento permanece fora desta etapa por decisão do responsável.

O marketplace está publicado e a recuperação de senha tem recebimento de e-mail confirmado pelo responsável. As validações automatizadas passaram em 38 de 39 verificações HTTP e em dez verificações de navegador. Há uma falha de produção na API de cursos e eventos, conteúdo de teste no catálogo e configurações editoriais pendentes. Portanto, esta rodada não comprova o cumprimento integral do Anexo I.

## Resultado dos testes desta rodada

| Verificação | Resultado | O que comprova |
|---|---|---|
| Quinze páginas públicas e arquivos de SEO | 15 aprovadas | Home, catálogo, cursos, eventos, contato, três telas de conta, cinco políticas, robots e sitemap respondem 200 |
| Dez APIs públicas e saúde | Nove aprovadas e uma falha | Saúde dos quatro domínios, catálogo, categorias, atributos e cinco consultas de políticas funcionam; GET /activities retorna 500 |
| Dez áreas protegidas sem sessão | Dez aprovadas | Notificações, inscrições, pedidos, entrega/documentos da loja e APIs administrativas recusam chamadas sem autenticação |
| Quatro requisições negativas | Quatro aprovadas | Recuperação/reset/contato recusam campos inválidos; endpoint interno permanece indisponível pelo gateway público |
| Chrome desktop e celular | Dez aprovadas | Home, catálogo, recuperação e cursos abrem em 1440 e 390 pixels, sem rolagem horizontal; requisições de API observadas usam o Render; sem erros JavaScript não tratados |
| Integração local com cinco processos reais | Aprovada novamente nesta rodada | Login/logout, duas lojas, pedido simulado, estoque, idempotência, isolamento, atributos, fiscal privado, inbox, CSV/XLSX, curso/inscrição/material, contato e analytics |
| E-mail Brevo | Recebimento confirmado pelo responsável | Confirmação operacional informada no chat. Esta rodada não reenviou e-mail nem acessou o link de recuperação |

Total HTTP: 39 verificações, 38 aprovadas, uma falha. As dez verificações do navegador são um conjunto separado. O teste de integração local usa PostgreSQL descartável e pagamento mock exclusivamente no ambiente de teste; não gera venda ou cobrança real.

Verificações adicionais: `/loja/dashboard` respondeu 301 para `/loja`; a home contém canonical e dados estruturados JSON-LD. Esses resultados não comprovam o mapeamento de todas as URLs históricas nem a validade de todo o conteúdo SEO.

## Falhas e configurações que precisam de atenção

1. **Cursos e eventos em produção:** GET `/api/v1/activities` retornou 500. A repetição com `?limit=10` também retornou 500. A página `/cursos` abre com 200, mas isso não comprova a listagem nem a inscrição. Conferir logs e migrations específicas de atividades; a causa de banco ainda não foi confirmada. Demonstrar essa jornada em homologação até corrigir e repetir os testes publicados.
2. **Produto de teste publicado:** a API pública lista cinco produtos e inclui `TESTE REGRESSAO Produto Seller B 1663039609`. O produto não foi removido nesta validação. Retirá-lo da apresentação pública após revisão e desativação autorizada com preservação de histórico.
3. **Documentos legais:** TERMS, PRIVACY, COOKIES, PURCHASE_RETURNS e PARTNER_ADHESION respondem 200 com `configured:false`. As estruturas funcionam, mas nenhum texto aprovado está publicado. Publicar versões revisadas; a adesão de parceiro pode depender desse aceite e dos tipos de documentos exigidos.
4. **Atributos:** consulta pública responde 200. Definições e valores reais precisam ser configurados para a apresentação; ausência de opções não significa que o filtro foi preenchido editorialmente.
5. **Áreas autenticadas em produção:** não foram fornecidas sessões de comprador, vendedor e administrador para esta rodada. A negativa sem sessão foi validada; funcionamento autenticado e permissões entre lojas foram demonstrados localmente, não em contas reais publicadas.
6. **Outras migrations:** a criação das tabelas de recuperação/notificações, atributos e políticas foi confirmada pelo resultado enviado pelo responsável e pelas consultas públicas. Isso não comprova a aplicação das outras migrations dos quatro schemas. Antes de homologar documentos, frete, financeiro e atividades em produção, conferir estrutura e histórico correspondentes.
7. **Comunicação comercial:** a faixa pública anuncia frete grátis para todo o Brasil acima de R$ 299. É necessário conferir se a regra comercial e a configuração de entrega de todas as lojas sustentam essa promessa; ela não foi validada nesta rodada. Na revisão visual, conferir também a legibilidade do texto sobre a fotografia escura do banner; a captura inicial mostrou contraste reduzido, sem medição formal de contraste nesta rodada.

## Segurança e limites da evidência

Os testes locais anteriores do mesmo código incluem 125 testes Identity, com sete provas PostgreSQL e diagnóstico de falhas Brevo sem dados sensíveis nos logs. Há também registros anteriores das suítes Sellers, Catalog, Orders e Gateway; esta rodada repetiu a integração completa, sem repetir indiscriminadamente todas as suítes.

Foi comprovada localmente proteção por usuário/loja, token com hash, expiração/uso único, revogação de sessões, retries, idempotência, XML sem DTD, anexos privados, permissões e exportação protegida. A verificação pública atual comprova recusa de acesso sem sessão e validação de entradas; não constitui teste de invasão completo, certificação ou garantia de ausência de vulnerabilidades.

O recebimento pela Brevo não comprova isoladamente o ciclo completo de redefinição em produção. Deve-se ainda registrar, com uma conta de teste controlada, alteração da senha, rejeição da senha anterior, revogação das sessões e rejeição do link reutilizado. Nunca incluir o link, token, senha ou chave na gravação da apresentação.

Não foram comprovados nesta rodada: cobrança/split/repasse bancário, transportadora externa, emissão fiscal, MFA e rotação efetiva das credenciais expostas, backup/restauração de produção, mil usuários simultâneos, LCP p75 de produção ou SLA. As provas locais anteriores de backup/carga/desempenho mantêm os limites descritos nos respectivos relatórios.

## Evidências e rastreio

- `artifacts/public-release-validation-20261113.json`: cada status HTTP, expectativa, duração e achado público.
- `artifacts/public-browser-validation-20261113.json`: resultados Chrome desktop/celular e origem da API.
- `artifacts/presentation-integration-20261113.log` e `artifacts/closure-final-smoke.json`: integração local repetida.
- `artifacts/brevo-diagnostics-tests.log`: 125 testes Identity do código de diagnóstico.
- Scripts reproduzíveis: `scripts/validate-public-release.mjs` e `scripts/validate-public-browser.mjs`.
- Backend local: `041114d`; frontend local: `8b706c6`. O SHA exato das releases de produção não foi consultado nos painéis; o funcionamento das rotas foi verificado diretamente nas URLs públicas.

Os dados privados de banco, tokens e chaves ficam fora deste documento. Não foram criados usuários, cursos, contatos, pedidos ou pagamentos em produção nesta rodada.
