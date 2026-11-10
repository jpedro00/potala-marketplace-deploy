import { SellerMembershipRole, SellerStatus } from '@prisma/client';
import { Request } from 'express';
import { Role, UserStatus } from './identity-enums';

/** Shape returned by identity-service's /internal/sessions/introspect and /internal/users/:id. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
  roles: Role[];
  isSuperAdmin?: boolean;
  grants?: unknown;
}

export interface SellerContext {
  membershipId: string;
  userId: string;
  sellerId: string;
  membershipRole: SellerMembershipRole;
  sellerStatus: SellerStatus;
}

export interface RequestWithAuth extends Request {
  authUser?: AuthenticatedUser;
  sellerContext?: SellerContext;
}
