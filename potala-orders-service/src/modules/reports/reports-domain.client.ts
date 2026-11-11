import {
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { INTERNAL_API_KEY_HEADER } from '../../common/constants/auth.constants';
export const DOMAIN_REPORTS = {
  contacts: {
    label: 'Contatos recebidos',
    domain: 'catalogService',
    scoped: false,
    fields: ['id', 'subject', 'status', 'createdAt'],
  },
  products: {
    label: 'Produtos',
    domain: 'catalogService',
    scoped: true,
    fields: [
      'id',
      'sellerId',
      'categoryId',
      'title',
      'status',
      'priceCents',
      'createdAt',
    ],
  },
  stock: {
    label: 'Estoque por SKU',
    domain: 'catalogService',
    scoped: true,
    fields: [
      'id',
      'productId',
      'sellerId',
      'sku',
      'name',
      'priceCents',
      'active',
      'quantity',
      'reservedQuantity',
      'availableQuantity',
      'createdAt',
    ],
  },
  vendors: {
    label: 'Vendedores',
    domain: 'sellersService',
    scoped: true,
    fields: ['id', 'tradeName', 'slug', 'status', 'commissionBps', 'createdAt'],
  },
  customers: {
    label: 'Clientes (dados operacionais mínimos)',
    domain: 'identityService',
    scoped: false,
    fields: ['id', 'status', 'emailVerifiedAt', 'createdAt'],
  },
  activities: {
    label: 'Cursos, eventos e recorrências',
    domain: 'catalogService',
    scoped: true,
    fields: [
      'id',
      'sellerId',
      'title',
      'kind',
      'status',
      'priceCents',
      'capacity',
      'enrollmentDeadline',
      'createdAt',
    ],
  },
  sessions: {
    label: 'Agenda de cursos e eventos',
    domain: 'catalogService',
    scoped: true,
    fields: ['id', 'activityId', 'title', 'startsAt', 'endsAt'],
  },
  enrollments: {
    label: 'Inscrições em cursos e eventos',
    domain: 'catalogService',
    scoped: true,
    fields: [
      'id',
      'activityId',
      'userId',
      'status',
      'priceCents',
      'orderId',
      'createdAt',
    ],
  },
} as const;
@Injectable()
export class ReportsDomainClient {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}
  async rows(
    key: keyof typeof DOMAIN_REPORTS,
    query: {
      sellerIds?: string[];
      from?: string;
      to?: string;
      status?: string;
    },
  ) {
    const endpoint = this.config.get(DOMAIN_REPORTS[key].domain, {
      infer: true,
    });
    const rows: Record<string, unknown>[] = [];
    let after: string | undefined;
    do {
      let response: Response;
      try {
        response = await fetch(
          `${endpoint.baseUrl}/api/v1/internal/reports/${key}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              [INTERNAL_API_KEY_HEADER]: endpoint.apiKey,
            },
            body: JSON.stringify({ ...query, after }),
            signal: AbortSignal.timeout(endpoint.timeoutMs),
          },
        );
      } catch {
        throw new ServiceUnavailableException('Report source unavailable');
      }
      if (response.status === 400)
        throw new BadRequestException('Invalid report filters');
      if (!response.ok)
        throw new ServiceUnavailableException('Report source unavailable');
      const page = (await response.json()) as {
        rows: Record<string, unknown>[];
        next: string | null;
      };
      if (
        !Array.isArray(page.rows) ||
        page.rows.length > 500 ||
        (page.next !== null &&
          (typeof page.next !== 'string' ||
            page.next === after ||
            !page.rows.length))
      )
        throw new ServiceUnavailableException('Invalid report source response');
      rows.push(...page.rows);
      if (rows.length > 10000 || (rows.length === 10000 && page.next))
        throw new BadRequestException(
          'Export exceeds 10000 rows; narrow date/seller filters',
        );
      after = page.next ?? undefined;
    } while (after);
    return { rows, fields: DOMAIN_REPORTS[key].fields };
  }
}
