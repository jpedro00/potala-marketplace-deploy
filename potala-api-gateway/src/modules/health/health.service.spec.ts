import { HealthService } from './health.service';

function createConfigMock(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    identityServiceUrl: 'http://localhost:3001',
    sellersServiceUrl: 'http://localhost:3002',
    catalogServiceUrl: 'http://localhost:3003',
    ordersServiceUrl: 'http://localhost:3004',
    healthCheckTimeoutMs: 3000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('HealthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('liveness always reports ok without touching the network', () => {
    const service = new HealthService(createConfigMock() as never);
    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('reports ok when all upstreams are up', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    const service = new HealthService(createConfigMock() as never);

    const result = await service.readiness();

    expect(result.status).toBe('ok');
    expect(result.upstreams).toEqual([
      { name: 'identity-service', status: 'up' },
      { name: 'sellers-service', status: 'up' },
      { name: 'catalog-service', status: 'up' },
      { name: 'orders-service', status: 'up' },
    ]);
  });

  it('reports degraded when one upstream is down', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true }) as typeof fetch;
    const service = new HealthService(createConfigMock() as never);

    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.upstreams).toEqual([
      { name: 'identity-service', status: 'up' },
      { name: 'sellers-service', status: 'down' },
      { name: 'catalog-service', status: 'up' },
      { name: 'orders-service', status: 'up' },
    ]);
  });

  it('treats a non-2xx upstream response as down', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as typeof fetch;
    const service = new HealthService(createConfigMock() as never);

    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.upstreams.every((u) => u.status === 'down')).toBe(true);
  });
});
