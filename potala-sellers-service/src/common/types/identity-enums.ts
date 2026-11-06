/**
 * Plain TS mirrors of identity-service's Prisma enums `Role` and
 * `UserStatus`. sellers-service does not own the `User` model — it lives in
 * the `identity` schema, a separate service and database boundary (see the
 * architecture analysis) — so these cannot come from this service's own
 * Prisma client. Same pattern identity-service uses for `DocumentType`
 * (common/types/document-type.ts), mirrored here in the other direction.
 *
 * Keep these values in sync with identity-service's prisma/schema.prisma by
 * hand — a mismatch would silently misclassify roles/status coming back from
 * IdentityServiceClient.introspectSession / IdentityServiceClient.getUserById.
 */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}
