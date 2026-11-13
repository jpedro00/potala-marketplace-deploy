// Copies reviewed source migrations only. Never connects to or alters a database.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const output=join(root,'artifacts','marketplace-migrations-20261113');
await mkdir(output,{recursive:true});
const manifest=[];
let index=1;
for(const domain of ['identity','sellers','catalog','orders']) {
 const source=join(root,`potala-${domain}-service`,'prisma','migrations');
 for(const entry of (await readdir(source,{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name.startsWith('202611')).sort((a,b)=>a.name.localeCompare(b.name))) {
  const bytes=await readFile(join(source,entry.name,'migration.sql'));
  const file=`${String(index++).padStart(2,'0')}-${domain}-${entry.name}.sql`;
  await writeFile(join(output,file),bytes);
  manifest.push({order:index-1,schema:domain,migration:entry.name,file,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
}
await writeFile(join(output,'manifest.json'),JSON.stringify({scope:'marketplace only; one database with four schemas',includesInitialMigrations:false,migrations:manifest},null,2)+'\n');
await writeFile(join(output,'00-verificar-banco.sql'),`-- SOMENTE LEITURA. Executar antes dos arquivos numerados; nao altera o banco.
SELECT current_database() AS banco, current_user AS usuario;
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('identity','sellers','catalog','orders') ORDER BY schema_name;
SELECT schemaname AS schema, tablename AS tabela FROM pg_tables
WHERE schemaname IN ('identity','sellers','catalog','orders') ORDER BY schemaname,tablename;
SELECT table_schema AS schema,table_name AS tabela,column_name AS coluna,data_type AS tipo
FROM information_schema.columns WHERE table_schema IN ('identity','sellers','catalog','orders')
ORDER BY table_schema,table_name,ordinal_position;
SELECT n.nspname AS schema,t.typname AS tipo,e.enumlabel AS valor
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname IN ('identity','sellers','catalog','orders') ORDER BY n.nspname,t.typname,e.enumsortorder;
SELECT schemaname AS schema_do_historico,tablename FROM pg_tables WHERE tablename='_prisma_migrations';
-- Localize o historico acima antes de consultar migration_name/checksum/finished_at/rolled_back_at.
-- Nao presumir que o historico de todos os servicos esta em public.
SELECT to_regclass('identity."AccountActionToken"') AS tokens_recuperacao,
 to_regclass('identity."Notification"') AS notificacoes,
 to_regclass('catalog."ProductAttributeDefinition"') AS atributos,
 to_regclass('catalog."LegalPolicy"') AS politicas;
`);
await writeFile(join(output,'LEIA-ME.txt'),`MARKETPLACE POTALA - 13/11/2026
Um unico banco, schemas identity, sellers, catalog e orders. Instituto excluido.
${manifest.length} migrations da entrega de novembro, copiadas SEM MODIFICAR os arquivos SQL originais.
O pacote nao inclui init, migracoes antigas ou seeds. Pressupoe a base anterior de setembro/outubro instalada.
NAO executar todos os SQL indiscriminadamente: parte pode ja estar aplicada.

1. Confirmar projeto Potala correto e backup recente antes de DDL.
2. No Supabase SQL Editor, executar 00-verificar-banco.sql (somente leitura).
3. Conferir estrutura E historico Prisma. O inventario mostra onde _prisma_migrations existe.
   Para cada tabela de historico existente, consultar migration_name, checksum, finished_at e rolled_back_at.
   Se houver erro de migracao anterior, drift ou instalacao parcial, diagnosticar antes de repetir.
4. Aplicar SOMENTE arquivos pendentes, na ordem dos prefixos. Um arquivo por execucao.
   Para atomicidade, executar BEGIN; conteudo do arquivo; COMMIT; na mesma execucao.
   Nao continuar se um arquivo falhar; verificar a mensagem e o estado antes de retomar.
5. Repetir o inventario e testar API. Tokens e notificacoes Brevo estao no arquivo 03-identity.
6. Se a execucao for manual, conciliar o resultado com o historico Prisma ANTES de um futuro migrate deploy.
   Nao registrar como aplicada uma migration sem verificar todos os seus objetos e o hash original.

As migrations tem objetos qualificados por schema. NAO remover os prefixos nem trocar por public.
Ha nomes de migration iguais em schemas diferentes (partner_legal): nao deduplicar apenas pelo nome.
Na operacao Prisma, cada servico precisa de schema/historico corretamente identificado na conexao;
nao mover/duplicar historico existente nem marcar migrations antigas como aplicadas sem inventario.

Nao ha DROP TABLE, TRUNCATE ou DELETE de dados neste pacote; ha alteracao de indices/constraints e enums.
Nao serve para reinicializar banco, recriar produtos ou ativar gateway. Nenhuma alteracao executada em producao.
Manifesto SHA-256 em manifest.json permite conferir igualdade com os originais.
`);
// Verify the deliverable itself, without relying on successful copying alone.
for(const entry of manifest) {
 const actual=createHash('sha256').update(await readFile(join(output,entry.file))).digest('hex');
 if(actual!==entry.sha256)throw Error('Package verification failed');
}
console.log(JSON.stringify({output,migrations:manifest.length,schemas:[...new Set(manifest.map(m=>m.schema))],verified:true}));
