import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

export type LivenessResult = { status: 'ok' };

export type UpstreamStatus = { name: string; status: 'up' | 'down' };

export type ReadinessResult = {
  status: 'ok' | 'degraded';
  upstreams: UpstreamStatus[];
};

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /**
   * Deliberately does not probe upstreams: the gateway process itself is
   * alive even when a downstream service is down — that distinction is what
   * readiness() is for. An orchestrator that restarts the gateway on a
   * downstream outage it can't fix would just cause pointless restart loops.
   */
  liveness(): LivenessResult {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResult> {
    const identityServiceUrl = this.configService.get('identityServiceUrl', {
      infer: true,
    });
    const sellersServiceUrl = this.configService.get('sellersServiceUrl', {
      infer: true,
    });
    const catalogServiceUrl = this.configService.get('catalogServiceUrl', {
      infer: true,
    });
    const ordersServiceUrl = this.configService.get('ordersServiceUrl', {
      infer: true,
    });
    const healthCheckTimeoutMs = this.configService.get(
      'healthCheckTimeoutMs',
      { infer: true },
    );

    const [identity, sellers, catalog, orders] = await Promise.all([
      this.probe(
        'identity-service',
        `${identityServiceUrl}/api/v1/health/ready`,
        healthCheckTimeoutMs,
      ),
      this.probe(
        'sellers-service',
        `${sellersServiceUrl}/api/v1/health/ready`,
        healthCheckTimeoutMs,
      ),
      this.probe(
        'catalog-service',
        `${catalogServiceUrl}/api/v1/health/ready`,
        healthCheckTimeoutMs,
      ),
      this.probe(
        'orders-service',
        `${ordersServiceUrl}/api/v1/health/ready`,
        healthCheckTimeoutMs,
      ),
    ]);

    const upstreams = [identity, sellers, catalog, orders];
    const status = upstreams.every((u) => u.status === 'up')
      ? 'ok'
      : 'degraded';

    return { status, upstreams };
  }

  private async probe(
    name: string,
    url: string,
    timeoutMs: number,
  ): Promise<UpstreamStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return { name, status: response.ok ? 'up' : 'down' };
    } catch {
      // Same policy as every other service's readiness probe: never surface
      // the raw network error (could carry internal hostnames) in a public
      // response — "down" is all a caller needs.
      return { name, status: 'down' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
