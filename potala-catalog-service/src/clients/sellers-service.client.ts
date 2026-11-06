import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { SellerContext } from '../common/types/authenticated-user';
import { INTERNAL_API_KEY_HEADER } from '../common/constants/auth.constants';

/**
 * This service has no local `membros_vendedor` table — the monolith's own
 * SellerContextGuard resolved a seller's membership with a single local
 * Prisma query (`sellerMembership.findUnique`); that table now lives in
 * sellers-service's own `sellers` schema, a separate service and database
 * boundary, so this client is what makes that same lookup possible over the
 * network instead. Added to sellers-service specifically for this purpose —
 * see its docs/internal-api-contract.md and this service's own
 * docs/internal-api-contract.md for the full two-sided contract.
 */
@Injectable()
export class SellersServiceClient {
  private readonly logger = new Logger(SellersServiceClient.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /**
   * Calls sellers-service's GET /internal/sellers/membership/:userId.
   * Returns null when the user has no store membership (caller should
   * respond 403, exactly like sellers-service's own local SellerContextGuard
   * does for the same case), and throws ServiceUnavailableException if
   * sellers-service itself is unreachable or misbehaving (caller should
   * respond 503, never silently treat that as "no membership").
   */
  async getMembershipByUserId(userId: string): Promise<SellerContext | null> {
    const { baseUrl, apiKey, timeoutMs } = this.configService.get(
      'sellersService',
      { infer: true },
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/api/v1/internal/sellers/membership/${userId}`,
        {
          method: 'GET',
          headers: { [INTERNAL_API_KEY_HEADER]: apiKey },
          signal: controller.signal,
        },
      );
    } catch (error) {
      this.logger.error(
        `sellers-service unreachable: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Seller service is unavailable. Try again shortly.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      return (await response.json()) as SellerContext;
    }

    if (response.status === 404) {
      return null;
    }

    this.logger.error(
      `sellers-service returned unexpected status ${response.status} for membership lookup`,
    );
    throw new ServiceUnavailableException(
      'Seller service is unavailable. Try again shortly.',
    );
  }
}
