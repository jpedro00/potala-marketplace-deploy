import { randomUUID } from 'crypto';
import { PrismaClient, ProductAttributeDefinition, ProductAttributeKind, ProductItemType } from '@prisma/client';
import { AttributesService } from './attributes.service';
import { validateAttributeValues } from './attribute-values';
import { PrismaService } from '../../database/prisma.service';
describe('Attribute value boundaries',()=>{
  const def={key:'size',kind:'NUMBER',active:true,options:[]} as unknown as ProductAttributeDefinition;
  it('accepts typed values and rejects type confusion, unknown keys and excessive values',()=>{
    expect(validateAttributeValues({size:2.5},[def])).toEqual({size:2.5});
    for(const value of [{size:'2.5'},{size:Infinity},{other:2},JSON.parse('{"__proto__":{}}'),[],null,Object.fromEntries(Array.from({length:11},(_,i)=>['k'+i,i]))])expect(()=>validateAttributeValues(value,[def])).toThrow();
  });
});
const url=process.env.ATTRIBUTES_TEST_DATABASE_URL;
(url?describe:describe.skip)('Attributes PostgreSQL ownership and schema limits',()=>{
 let db:PrismaClient,service:AttributesService;
 const prefix='proof_'+randomUUID().replaceAll('-','').slice(0,8),seller=randomUUID(),foreign=randomUUID(),categoryId=randomUUID(),productId=randomUUID();
 const keys=Array.from({length:11},(_,i)=>prefix+'_'+i);
 beforeAll(async()=>{
  db=new PrismaClient({datasourceUrl:url});await db.$connect();service=new AttributesService(db as unknown as PrismaService);
  await db.category.create({data:{id:categoryId,name:prefix,slug:prefix,status:'ACTIVE'}});
  await db.product.create({data:{id:productId,sellerId:seller,categoryId,title:prefix,description:'Original',slug:prefix,priceCents:1200,itemType:'SERVICE'}});
 });
 afterAll(async()=>{await db.productImage.deleteMany({where:{productId}});await db.product.deleteMany({where:{id:productId}});await db.category.deleteMany({where:{id:categoryId}});await db.productAttributeDefinition.deleteMany({where:{key:{in:keys}}});await db.$disconnect();});
 it('serializes schema configuration to exactly ten active attributes',async()=>{
  const results=await Promise.allSettled(keys.map(key=>service.saveDefinition({itemType:ProductItemType.SERVICE,key,label:key,kind:ProductAttributeKind.TEXT,active:true})));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(10);
  expect(await db.productAttributeDefinition.count({where:{itemType:'SERVICE',active:true}})).toBe(10);
 },30000);
 it('persists metadata and typed filters without changing ownership or losing image validation',async()=>{
  const definitions=await db.productAttributeDefinition.findMany({where:{itemType:'SERVICE',active:true}});
  const key=definitions.find(def=>def.key.startsWith(prefix))!.key;
  const dto={itemType:ProductItemType.SERVICE,title:'Revised product',description:'Updated',priceCents:1490,attributes:{[key]:'configured value'},imageUrls:['https://example.com/product.png']};
  await expect(service.updateProduct(foreign,productId,dto)).rejects.toThrow();
  const saved=await service.updateProduct(seller,productId,dto);expect(saved.priceCents).toBe(1490);expect(saved.sellerId).toBe(seller);expect(saved.images).toHaveLength(1);
  const filters=await service.filters(ProductItemType.SERVICE,JSON.stringify(dto.attributes));
  expect(await db.product.count({where:{id:productId,AND:filters}})).toBe(1);
  await expect(service.updateProduct(seller,productId,{...dto,imageUrls:['https://localhost./private']})).rejects.toThrow();
  await expect(service.filters(ProductItemType.SERVICE,'{"unknown":"x"}')).rejects.toThrow();
 });
});
