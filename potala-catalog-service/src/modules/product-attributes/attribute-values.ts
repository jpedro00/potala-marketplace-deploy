import { BadRequestException } from '@nestjs/common';
import { ProductAttributeDefinition } from '@prisma/client';
export function validateAttributeValues(raw:unknown,definitions:ProductAttributeDefinition[]) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>10)throw new BadRequestException('Use up to ten attribute values');
  const result:Record<string,string|number|boolean>={};
  for(const [key,value] of Object.entries(raw)) {
    const definition=definitions.find(d=>d.active&&d.key===key);
    if(!definition||['constructor','prototype','__proto__'].includes(key))throw new BadRequestException('Unknown attribute');
    if(definition.kind==='BOOLEAN'&&typeof value==='boolean')result[key]=value;
    else if(definition.kind==='NUMBER'&&typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1000000000)result[key]=value;
    else if(['TEXT','CHOICE'].includes(definition.kind)&&typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value)){
      if(definition.kind==='CHOICE'&&(!Array.isArray(definition.options)||!definition.options.includes(value)))throw new BadRequestException('Invalid attribute choice');
      result[key]=value.trim();
    }else throw new BadRequestException('Attribute type does not match definition');
  }
  return result;
}
