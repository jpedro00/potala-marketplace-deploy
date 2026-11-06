/**
 * Not a Prisma enum here: identity-service validates CPF/CNPJ format on
 * behalf of the seller-registration flow but never stores a Seller row (that
 * table belongs to sellers-service). Kept as a plain TS union so this
 * service's schema doesn't carry a DB enum it has no table for.
 */
export enum DocumentType {
  CPF = 'CPF',
  CNPJ = 'CNPJ',
}
