import { Role, UserStatus } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
  roles: Role[];
}

export interface RequestWithAuth extends Request {
  authUser?: AuthenticatedUser;
}
