import { createHash, randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { Response } from 'express';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { SESSION_LAST_USED_TOUCH_MS } from '../../common/constants/auth.constants';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getCookieName(): string {
    return this.configService.get('session', { infer: true }).cookieName;
  }

  /**
   * SameSite must track cookieSecure, not be a fixed literal: in local dev
   * (frontend and backend both on localhost, different ports) they're
   * same-site and 'lax' works fine over plain http. In production the
   * frontend (Vercel) and backend (Render) are on different eTLD+1 domains,
   * so the cookie is cross-site — 'lax' would silently stop being sent on
   * the frontend's cross-origin fetch() calls, breaking auth after login.
   * 'none' requires Secure, which cookieSecure already guarantees whenever
   * this returns 'none' (see env.validation.ts: cookieSecure defaults to
   * isProduction).
   */
  private cookieSameSite(cookieSecure: boolean): 'lax' | 'none' {
    return cookieSecure ? 'none' : 'lax';
  }

  attachCookie(response: Response, token: string): void {
    const session = this.configService.get('session', { infer: true });
    response.cookie(session.cookieName, token, {
      httpOnly: true,
      sameSite: this.cookieSameSite(session.cookieSecure),
      path: '/',
      secure: session.cookieSecure,
      maxAge: session.ttlDays * 24 * 60 * 60 * 1000,
    });
  }

  clearCookie(response: Response): void {
    const session = this.configService.get('session', { infer: true });
    response.clearCookie(session.cookieName, {
      httpOnly: true,
      sameSite: this.cookieSameSite(session.cookieSecure),
      path: '/',
      secure: session.cookieSecure,
    });
  }

  async createSession(
    userId: string,
    verifiedPasswordHash?: string,
  ): Promise<{ token: string; sessionId: string }> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const ttlDays = this.configService.get('session', { infer: true }).ttlDays;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const data = {
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    };
    const session = verifiedPasswordHash
      ? await this.prisma.$transaction(async (tx) => {
          // Serialize with account resets, so credentials verified before a reset
          // cannot create a fresh session after its session-revocation step.
          await tx.$queryRaw`SELECT id FROM identity.usuarios WHERE id = ${userId}::uuid FOR UPDATE`;
          const current = await tx.user.findUnique({ where: { id: userId } });
          if (
            !current ||
            current.passwordHash !== verifiedPasswordHash ||
            current.status === UserStatus.BLOCKED
          )
            throw new UnauthorizedException('Invalid credentials');
          return tx.session.create(data);
        })
      : await this.prisma.session.create(data);

    return { token, sessionId: session.id };
  }

  shouldTouchLastUsed(
    lastUsedAt: Date,
    intervalMs: number,
    now: Date = new Date(),
  ): boolean {
    return now.getTime() - lastUsedAt.getTime() >= intervalMs;
  }

  /**
   * Single source of truth for "is this raw cookie token a valid session".
   * Used directly by SessionAuthGuard for requests that hit this service, and
   * by InternalController's /internal/sessions/introspect for the future
   * api-gateway (or any other service) that only has the cookie value and
   * needs to resolve it to a user, without touching this service's database.
   */
  async validateToken(token: string): Promise<AuthenticatedUser | null> {
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            roles: true,
            adminProfile: true,
            accessGrants: { include: { role: true } },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }

    if (session.user.status === UserStatus.BLOCKED) {
      return null;
    }

    if (
      this.shouldTouchLastUsed(session.lastUsedAt, SESSION_LAST_USED_TOUCH_MS)
    ) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      id: session.user.id,
      email: session.user.email,
      status: session.user.status,
      roles: session.user.roles.map((item) => item.role),
      isSuperAdmin:
        session.user.status === UserStatus.ACTIVE &&
        session.user.adminProfile?.isSuperAdmin === true,
      grants:
        session.user.status === UserStatus.ACTIVE
          ? (session.user.accessGrants ?? [])
              .filter(
                (g) =>
                  !g.revokedAt && (!g.expiresAt || g.expiresAt > new Date()),
              )
              .map((g) => ({
                grantId: g.id,
                roleKey: String(g.role.slot),
                permissions: g.role.permissions,
                scope: { type: g.scopeType, sellerIds: g.sellerIds },
                expiresAt: g.expiresAt?.toISOString() ?? null,
              }))
          : [],
    };
  }

  async revokeByToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
