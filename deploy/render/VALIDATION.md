# Validação local — 06/11/2026

## Resultado desta etapa

Pacote de implantação conjunta implementado em branch local `migration/render-bundle`, com gateway e quatro serviços em processos separados. Os cinco repositórios de origem continuam limpos. Nenhum tráfego, conta de hospedagem ou banco de produção foi alterado.

| Verificação | Resultado |
|---|---|
| Gateway | 65 testes aprovados, build aprovado |
| Identity | 100 testes aprovados, build aprovado |
| Sellers | 101 testes aprovados, build aprovado |
| Catalog | 213 testes aprovados, build aprovado |
| Orders | 588 testes aprovados, build aprovado |
| Configuração e supervisor | 7 testes aprovados |
| Total de testes automatizados | 1.074 aprovados |
| PostgreSQL descartável local | Quatro históricos de migration aplicados com sucesso |
| Launcher --check | Validou os cinco builds e ambientes antes do ensaio |
| Compra integrada | Duas lojas, dois produtos, pagamento mock aprovado, estoque baixado uma vez |
| Retry de checkout | Mesma chave retornou o mesmo pedido |
| Isolamento | Uma loja recebeu 404 ao consultar subpedido da outra |
| Sessão e entrada | Login, me, logout, bloqueio de sessão revogada e bloqueio de rota interna verificados |
| Health | Readiness conjunta chegou a 200 |
| Recuperação de código | Cinco bundles verificados, arquivo de recuperação exportado da tag |
| SQL | 13 arquivos iguais byte a byte às versões dos commits originais |

O ensaio usou Node 22.22.0, Windows e PostgreSQL 17 local. O cluster exclusivo em `artifacts/postgres`, porta 55432 e bind 127.0.0.1, foi encerrado após o ensaio. Os dados são sintéticos e os logs de teste ficam em artifacts, fora do Git. Os scripts novos de teste e supervisão não têm dependências npm adicionais.

## Correções necessárias encontradas nos testes

- Gateway anexava um salto extra ao X-Forwarded-For e o backend identificava clientes diferentes como o mesmo proxy. Foi reproduzido por HTTP real, corrigido e coberto por teste de dois IPs distintos.
- Gateway tinha apenas `/health`. Foi adicionado o alias `/api/v1/health`, mantendo a rota anterior e viabilizando a verificação de saúde descrita no blueprint.
- Fixture de validação do gateway omitia as URLs obrigatórias de Catalog e Orders. A fixture e o resultado esperado foram atualizados.
- Testes do Catálogo usavam IDs que falhavam na validação UUID v4 e o mock transacional omitia `$queryRaw`. Foram corrigidos os dados de teste e o mock para exercer as operações previstas.
- Os quatro serviços agora aceitam HOST configurável, com padrão original 0.0.0.0. O pacote fornece 127.0.0.1.
- Arquivos SQL receberam exceção explícita de conversão de finais de linha. A tag de recuperação exata é `original-services-exact-20261106` no commit `4bb759a`. Ela preserva o código original e os SQL exatos, com atributos Git de proteção.

## Pendências de validação

1. Em 06/11/2026, o Docker construiu a imagem `potala-marketplace:homolog`. O ensaio executou os cinco processos dentro da imagem com PostgreSQL 17 descartável e passou por login, compra simulada em duas lojas, repetição do checkout, estoque, isolamento entre vendedores e logout. O ensaio iniciou os processos pelo script de teste. Em 09/11/2026, outro ensaio iniciou a imagem pelo comando padrão em modo de produção, obteve HTTP 2xx em /api/v1/health/ready e encerrou o contêiner com docker stop, código 0 e OOMKilled=false.
2. O lint completo ainda acusa 168 apontamentos de formatação no conjunto, incluindo código herdado. Distribuição observada: gateway 3, identity 27, sellers 17, catalog 37, orders 84. Não declarar lint aprovado. O pacote evita uma reformatação geral nesta migração.
3. Ainda faltam homologação no Render, memória/CPU/pools sob carga, cookies/CORS no domínio final, frontend no navegador e ensaio operacional de corte/retorno.
4. Antes da publicação, registrar destinos e releases atuais, backups/restauração de dados, conta, domínio, plano aprovado e banco de homologação.
5. As dependências travadas emitiram avisos de manutenção/depreciação na instalação. A auditoria de vulnerabilidades para produção permanece pendente.

## Retorno

Seguir `ROLLBACK.md`. O código pode ser recuperado agora pela tag exata e pelos bundles. O retorno operacional precisa do registro dos destinos originais e de ensaio com a infraestrutura. A implantação conjunta só deve receber tráfego real após concluir esses gates.
