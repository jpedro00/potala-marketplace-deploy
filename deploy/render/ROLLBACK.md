# Retorno ao ambiente original

## Pontos de recuperação existentes

O commit inicial deste repositório contém snapshots dos cinco serviços. A tag `original-services-exact-20261106` identifica esse estado. `sources.json` registra o SHA e a branch de cada repositório de origem, além do hash dos arquivos zip originais. Os repositórios originais estão na pasta superior, e os bundles completos ficam em `../migration-backups-20261106/`.

Para recuperar código em uma nova pasta, a partir deste repositório:

```powershell
git worktree add --detach ../potala-original-recovery original-services-exact-20261106
```

Para recuperar o histórico de um serviço usando o backup, a partir da pasta principal:

```powershell
git clone ./migration-backups-20261106/potala-orders-service.bundle ./potala-orders-recovery
git -C ./potala-orders-recovery switch --detach ca8223211149c812056a1481cc5aeac720eaec6e
```

Esses comandos exigem destinos novos. O backup de código deve ser copiado para um local durável controlado pelo Potala. Bundles e fontes não contêm o estado do banco ou os segredos de implantação.

## Registro obrigatório antes de qualquer corte

Preencher em registro privado: URL/hostname original da API, identificadores dos serviços originais, releases publicadas, release do frontend, valor original de NEXT_PUBLIC_API_BASE_URL, DNS/TTL se houver troca de domínio, nomes e opções do cookie, responsáveis e horário do corte. Referenciar onde estão guardados os segredos sem copiá-los para este arquivo.

Registrar backup recente e restauração verificada do banco, schemas e histórico de migrations. Confirmar ausência de migração destrutiva nesta entrega. Os serviços originais precisam estar disponíveis para retorno. O estado de produção não foi inspecionado durante esta preparação local.

## Procedimento de corte em homologação e depois em produção

1. Publicar a nova unidade com uma URL de homologação e banco isolado. Testar readiness, login, produto, compra com duas lojas e isolamento dos pedidos.
2. Ensaiar retorno antes do corte de produção e medir duração. Testar mudança de origem/CORS/cookie e eventuais logins novos.
3. Na janela real, pausar mutações no acesso público por manutenção controlada, drenar requisições e registrar pedidos em andamento. A manutenção deve cobrir clientes com páginas antigas ainda abertas.
4. Garantir um único conjunto recebendo escritas e um único destino de webhook. A nova imagem não executa migrations ou seeds automaticamente.
5. Trocar o destino da API. Se a URL usada pelo frontend mudar, publicar um novo build com NEXT_PUBLIC_API_BASE_URL. Se usar o mesmo hostname, aplicar a troca de roteamento/DNS ensaiada e observar o período de cache.
6. Validar operações essenciais e liberar compras. Registrar release e hora, erros, latência, estoque e pedidos de teste.

## Quando retornar

Retornar se ocorrer falha sistemática de login/checkout, erro de encaminhamento, instabilidade dos processos, acesso cruzado entre lojas ou inconsistência de dados. Falha de integridade exige interromper mutações e investigar antes de reabri-las.

1. Pausar mutações e drenar o contêiner novo. Registrar pedidos já aceitos e operações pendentes.
2. Conferir prontidão dos serviços originais e compatibilidade com o estado atual do banco.
3. Restaurar o destino original no frontend ou no roteamento do hostname. Restaurar o destino de webhook e as configurações de origem/cookie ensaiadas.
4. Confirmar login, catálogo, consulta dos pedidos recentes e isolamento de vendedor. Conferir estoque e histórico da compra feita após a troca.
5. Liberar mutações somente no destino original e monitorar. Guardar logs e release da falha para diagnóstico.

O retorno de tráfego preserva as vendas novas no banco. Restaurar um backup anterior sobre vendas aceitas pode perder dados e requer reconciliação e decisão explícita. Rollback da imagem no Render restaura a release conjunta anterior, enquanto retorno aos quatro serviços originais usa as configurações registradas acima.

## Situação desta etapa

Código original recuperável localmente. Ensaio operacional de corte/retorno aguarda Docker, banco de homologação e acesso ao ambiente. Esta preparação não mudou o destino de tráfego do marketplace.
