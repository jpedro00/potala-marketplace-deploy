/**
 * Plain TS mirrors of sellers-service's Prisma enums `SellerMembershipRole`
 * and `SellerStatus`. catalog-service does not own the `Seller` /
 * `SellerMembership` models — they live in the `sellers` schema, a separate
 * service and database boundary — so these cannot come from this service's
 * own Prisma client. Same pattern used for identity-service's enums
 * (identity-enums.ts) and by sellers-service itself for identity-service's.
 *
 * Keep these values in sync with sellers-service's prisma/schema.prisma by
 * hand — a mismatch would silently misclassify what
 * SellersServiceClient.getMembershipByUserId returns.
 */
export enum SellerMembershipRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
}

export enum SellerStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
}
