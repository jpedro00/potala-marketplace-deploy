import { ProductAttributeKind, ProductItemType } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_PRICE_CENTS, MAX_PRODUCT_DESCRIPTION_LENGTH, MAX_PRODUCT_IMAGE_URLS } from '../products/products.constants';
export class AttributeTypeQuery {
  @IsEnum(ProductItemType) itemType!: ProductItemType;
}
export class SaveDefinitionDto extends AttributeTypeQuery {
  @Matches(/^[a-z][a-z0-9_]{0,39}$/) key!: string;
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @Length(1,80) label!: string;
  @IsEnum(ProductAttributeKind) kind!: ProductAttributeKind;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({each:true}) @Length(1,200,{each:true}) options?:string[];
  @IsBoolean() active!:boolean;
}
export class SaveProductDetailsDto extends AttributeTypeQuery {
  @IsObject() attributes!:Record<string,unknown>;
  @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @Length(1,160) title!:string;
  @IsString() @MaxLength(MAX_PRODUCT_DESCRIPTION_LENGTH) description!:string;
  @IsInt() @Min(0) @Max(MAX_PRICE_CENTS) priceCents!:number;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGE_URLS) @IsUrl({protocols:['https'],require_protocol:true},{each:true}) @MaxLength(2048,{each:true}) imageUrls?:string[];
}
