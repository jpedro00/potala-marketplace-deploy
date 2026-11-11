# Fechamento das sete pendências de 11/11

Spec: Anexo I pp.2–9; avaliação `docs/avaliacao-final-anexo-20261110.md`; autorização explícita do usuário para corrigir e publicar as sete frentes. Continuar nas branches de implementação existentes, preservando alteração prévia em deploy/render/VALIDATION.md. Não presumir aprovação comercial, ferramenta externa de tags ou conteúdo real. Nenhum pagamento real será habilitado nesta etapa.

## Decisões

Reutilizar Nest/Prisma/Next e APIs existentes, mudanças aditivas. Relatórios administrativos serão compostos por dez visões aprováveis, reunindo os temas contratuais sem adicionar limite artificial de dez endpoints. Dados pertencentes a outros domínios virão de endpoints internos autenticados; não acessar tabelas de outro serviço diretamente. Exportações devem preservar os filtros/escopos antes da extração.

Cursos recebem instrutores e dados estruturados de modalidade/local/link, validação no servidor e formulários. Conteúdo real existente não será inventado. Materiais e inscrições preservam comportamento e IDs.

Contato será persistido antes de emitir confirmação/evento; não confundir clique com envio. Analytics próprio continua como solução atual, com configuração de tags externa somente se houver aprovação identificável. Nenhum script arbitrário será carregado no navegador.

Inventário de URLs será proveniente de páginas/fontes reais do domínio legado, com 301 apenas para destino correspondente verificado. Produtos confirmados como fixtures serão desativados com registro/backup, não excluídos fisicamente. Acesso de produção e inventário devem ser descobertos antes de pedir credenciais ao usuário.

## Tarefas e propriedade

- [x] Relatórios: Orders reports e clientes internos; endpoints internos de leitura Catalog/Sellers/Identity; frontend ServerReportsView e API correspondente. Provar temas produtos/estoque, vendedores/clientes, cursos/eventos, atendimentos, faturamento, comissões/taxas/repasses e exportações filtradas. Não inventar repasse concluído.
- [x] Cursos: Catalog activities/schema/migration e frontend features/activities, clientes de atividades. Instrutores, presencial/on-line/híbrido e local/link. Provas de validação, autorização, gravação e leitura.
- [ ] Operação: inventário legado, scripts de backup/restauração/carga/desempenho e evidências; conferir contas/MFA/segredos com metadados, sem imprimir valores. Não executar carga em produção compartilhada nem rotação parcial que interrompa serviços.
- [x] Contato/tags: raiz implementa recebimento persistente, guardas antispam, evento confirmado e consentido, testes, documentação de aprovação/configuração.
- [ ] Catálogo: raiz identifica fixtures com evidência positiva e desativa reversivelmente somente após backup e confirmação de ambiente.
- [x] Integração: gerar clientes, migrations no banco isolado, builds e testes relevantes; revisão cruzada dos módulos e smoke completo.
- [ ] Publicação: verificar alvo, acesso, backup de produção restaurável, versões de retorno, migrations e bootstrap; publicar backend/frontend e homologar os fluxos permitidos sem cobranças reais. Registrar bloqueios externos com evidência, sem chamar preparo de implantação concluída.

## Evidências e limites

Registrar progresso em `docs/closure-progress-20261111.md`, arquivos locais sensíveis somente em artifacts ignorado. Critérios: CSV/XLSX reais, isolamento e filtros; dados estruturados de curso; contato aceito persistido; 301 sem open redirect; fixture identificada removida da vitrine; backup restaurado em alvo separado com integridade/tempos; carga e LCP com condições/métricas explícitas. MFA/rotação só comprovados se verificados nos provedores, nunca por existência de checklist.

## Encerramento técnico local

Resultados em `docs/closure-results-20261111.md` e evidências resumidas em `docs/validation-summary-20261111.json`. Inventário histórico, aplicação da moderação em produção, publicação, MFA/rotação e critérios operacionais de produção continuam explicitamente parciais/pendentes. Não chamar o conjunto de aceite contratual concluído.
