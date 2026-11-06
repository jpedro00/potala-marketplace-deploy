import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { DocumentType } from '../common/types/document-type';
import { INTERNAL_API_KEY_HEADER } from '../common/constants/auth.constants';

export interface CreateSellerForOwnerInput {
  userId: string;
  ownerName: string;
  legalName: string;
  tradeName: string;
  documentType: DocumentType;
  /** Already normalized to digits-only and check-digit validated by identity-service. */
  documentNumberDigits: string;
  storeEmail: string;
  phone: string;
  description?: string;
}

export interface CreateSellerForOwnerResult {
  sellerId: string;
  tradeName: string;
  slug: string;
  status: string;
  membershipId: string;
  membershipRole: string;
}

/**
 * Client for the internal contract sellers-service must implement. Until
 * that service exists, every call fails fast with a clear 503 instead of
 * hanging or throwing an opaque network error — see
 * docs/internal-api-contract.md for the full contract and for what
 * identity-service does when this call fails mid-registration
 * (compensating delete of the just-created User).
 */
@Injectable()
export class SellersServiceClient {
  private readonly logger = new Logger(SellersServiceClient.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async createSellerForOwner(
    input: CreateSellerForOwnerInput,
  ): Promise<CreateSellerForOwnerResult> {
    const { baseUrl, apiKey, timeoutMs } = this.configService.get(
      'sellersService',
      { infer: true },
    );

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Store creation is not available yet: sellers-service is not configured (SELLERS_SERVICE_URL / SELLERS_SERVICE_API_KEY).',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v1/internal/sellers`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [INTERNAL_API_KEY_HEADER]: apiKey,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error(
        `sellers-service unreachable: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Store service is unavailable. Try again shortly.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 201) {
      return (await response.json()) as CreateSellerForOwnerResult;
    }

    if (response.status === 409) {
      throw new ConflictException(
        'A store with this document already exists',
      );
    }

    if (response.status === 422) {
      const body = await response
        .json()
        .catch((): { message?: string } => ({}));
      throw new UnprocessableEntityException(body.message ?? 'Invalid store data');
    }

    this.logger.error(
      `sellers-service returned unexpected status ${response.status} for internal seller creation`,
    );
    throw new ServiceUnavailableException(
      'Store service is unavailable. Try again shortly.',
    );
  }
}
