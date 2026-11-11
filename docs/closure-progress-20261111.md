# Progresso — plano docs/superpowers/plans/2026-11-11-contract-closure.md

- Base backend: 03f4ce9; frontend: 7599e39; branches feature/marketplace-completion-20261110.
- Autorização: usuário solicitou as sete correções, incluindo publicação, homologação e comprovações operacionais.
- Ruling: usar a arquitetura existente e continuar na feature branch — trabalho é continuação da entrega, sem necessidade de opções de tecnologia novas.
- Ruling: não presumir ferramenta de tags aprovada, resultados de MFA ou credenciais rotacionadas — dependem de evidência de conta/configuração.
- Estado inicial: código anterior commitado/enviado; produção não atualizada; VALIDATION.md anterior preservado.
- 11/11: usuário confirmou medição própria, tags externas desativadas; recusou necessidade de novas conexões. Não voltar a solicitar credenciais/conexões; produção sem acesso verificado permanece pendente, nunca declarar homologada.
- Relatórios: 20 subvisões/10 grupos e HTTP interno por domínio; revisão acrescentou interseção de concessões operacional/financeira. Casos negativos e XLSX testados.
- Cursos: instrutores/modalidade/local/link privados; endpoint metadata-only para histórico legado; normalização de ponto final em host. Revisão cruzada corrigida.
- Contato: persistência e protocolo idempotentes, evento servidor transacional consentido, caixa admin e auditoria; prova real de navegador e PostgreSQL passou.
- Local: 1.236 testes dos serviços e 10 operacionais aprovados, builds e lint/types relevantes aprovados; seis auditorias runtime zero achados conhecidos.
- Operação: dump/restauração local real e LCP30 amostras passaram; teste1000/IPúnico bloqueado majoritariamente429, readiness503 e recuperação documentados sem claimcapacidade. MFA/rotação e produção não executados.
- Produtos: cinco públicos revisados; fixture identificada e script reversível preparado; sem sessão de admin não houve desativação publicada.
- Legado: 523URLs inventariadas/30páginas lidas; zero novosdestinos equivalentes aprovados; preservar institucional, não inventar301.

- Revisão final: P1 UUIDs de sessão em caixa diferente usavam locks distintos; P2 editor de detalhes mantinha instrutores antigos. Regressões RED confirmaram os dois achados; fix canonicaliza UUIDs nos locks e remonta formulário quando metadados persistidos mudam. GREEN: 11 testes focados de consentimento/contato, 299 Catalog completos, build Catalog e Next e regressão de dois editores aprovados.
- Backup final: 53 digests SHA-256 de todas as linhas canônicas comparados com igualdade na restauração, além de contagens e 43 FKs. Execução: ops_restore_1794418506801, 162627 bytes, dump 640,47 ms, restore 1050,98 ms.
