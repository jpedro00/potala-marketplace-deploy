import { Role, User, UserStatus } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  roles: Role[];
  createdAt: Date;
}

export function toPublicUser(
  user: Pick<
    User,
    'id' | 'email' | 'status' | 'emailVerifiedAt' | 'createdAt'
  > & {
    roles: Array<{ role: Role }>;
  },
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    roles: user.roles.map((item) => item.role),
    createdAt: user.createdAt,
  };
}
