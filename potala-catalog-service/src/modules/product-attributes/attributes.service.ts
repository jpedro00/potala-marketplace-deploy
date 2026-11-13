import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductItemType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SaveDefinitionDto, SaveProductDetailsDto } from './attributes.dto';
import { validateAttributeValues } from './attribute-values';
import { isIP } from 'node:net';
@Injectable()
export class AttributesService {
  constructor(private readonly prisma:PrismaService){}
  list(itemType:ProductItemType,admin=false){return this.prisma.productAttributeDefinition.findMany({where:{itemType,...(!admin?{active:true}:{})},orderBy:{key:'asc'}});}
  async saveDefinition(dto:SaveDefinitionDto){
    if(['constructor','prototype','__proto__'].includes(dto.key))throw new BadRequestException('Reserved attribute key');
    const options=(dto.options??[]).map(option=>option.trim());
    if(options.some(option=>!option))throw new BadRequestException('Choices cannot be blank');
    if(dto.kind==='CHOICE'&&(!options.length||new Set(options).size!==options.length))throw new BadRequestException('Provide distinct choices');
    if(dto.kind!=='CHOICE'&&options.length)throw new BadRequestException('Choices apply only to CHOICE attributes');
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'attributes:'+dto.itemType},0))`);
      const existing=await tx.productAttributeDefinition.findUnique({where:{itemType_key:{itemType:dto.itemType,key:dto.key}}});
      if(existing&&existing.kind!==dto.kind)throw new ConflictException('Create a new key to change the attribute type');
      if(dto.active&&!existing?.active&&await tx.productAttributeDefinition.count({where:{itemType:dto.itemType,active:true}})>=10)throw new ConflictException('Ten active attributes maximum per item type');
      if(existing?.kind==='CHOICE'&&Array.isArray(existing.options))for(const old of existing.options){
        if(typeof old!=='string')throw new BadRequestException('Invalid saved attribute choices');
        if(!options.includes(old)&&await tx.product.count({where:{itemType:dto.itemType,attributes:{path:[dto.key],equals:old}}}))throw new ConflictException('Choice is used by existing products');
      }
      return tx.productAttributeDefinition.upsert({where:{itemType_key:{itemType:dto.itemType,key:dto.key}},create:{...dto,options},update:{label:dto.label,options,active:dto.active}});
    });
  }
  async updateProduct(sellerId:string,id:string,dto:SaveProductDetailsDto){
    for(const value of dto.imageUrls??[]) {
      const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');
      if(url.protocol!=='https:'||url.username||url.password||isIP(host.replace(/^\[|\]$/g,''))||host==='localhost'||/\.(localhost|local|internal)$/.test(host))throw new BadRequestException('Use public HTTPS image URLs');
    }
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'attributes:'+dto.itemType},0))`);
      const product=await tx.product.findFirst({where:{id,sellerId}});if(!product)throw new NotFoundException();
      const definitions=await tx.productAttributeDefinition.findMany({where:{itemType:dto.itemType,active:true}});
      const attributes=validateAttributeValues(dto.attributes,definitions);
      if(dto.imageUrls){await tx.productImage.deleteMany({where:{productId:id}});await tx.productImage.createMany({data:dto.imageUrls.map((url,position)=>({productId:id,url,position}))});}
      return tx.product.update({where:{id},data:{itemType:dto.itemType,attributes,title:dto.title,description:dto.description,priceCents:dto.priceCents},include:{images:{orderBy:{position:'asc'}},variants:{include:{inventory:true}}}});
    });
  }
  async filters(itemType:ProductItemType,serialized?:string):Promise<Prisma.ProductWhereInput[]> {
    if(!serialized)return[];
    let input:unknown;try{input=JSON.parse(serialized);}catch{throw new BadRequestException('Invalid attribute filter JSON');}
    const values=validateAttributeValues(input,await this.list(itemType));
    return Object.entries(values).map(([key,value])=>({attributes:{path:[key],equals:value}}));
  }
}
