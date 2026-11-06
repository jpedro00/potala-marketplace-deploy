import { validateEnv } from './env.validation';

const baseEnv = {
  NODE_ENV: 'test',
  FRONTEND_URL: 'http://localhost:3000',
  IDENTITY_SERVICE_URL: 'http://localhost:3001',
  SELLERS_SERVICE_URL: 'http://localhost:3002',
  CATALOG_SERVICE_URL: 'http://localhost:3003',
  ORDERS_SERVICE_URL: 'http://localhost:3004',
};

describe('validateEnv', () => {
  it('applies every default when only the required variables are set', () => {
    const config = validateEnv(baseEnv);

    expect(config).toEqual({
      nodeEnv: 'test',
      port: 8080,
      frontendUrl: 'http://localhost:3000',
      identityServiceUrl: 'http://localhost:3001',
      sellersServiceUrl: 'http://localhost:3002',
      catalogServiceUrl: 'http://localhost:3003',
      ordersServiceUrl: 'http://localhost:3004',
      proxyTimeoutMs: 10_000,
      healthCheckTimeoutMs: 3_000,
      rateLimit: { windowMs: 60_000, max: 300 },
    });
  });

  describe('NODE_ENV', () => {
    it.each(['development', 'test', 'production'])('accepts %s', (value) => {
      expect(validateEnv({ ...baseEnv, NODE_ENV: value }).nodeEnv).toBe(value);
    });

    it.each(['staging', 'prod', 'Development'])('rejects %s', (value) => {
      expect(() => validateEnv({ ...baseEnv, NODE_ENV: value })).toThrow(
        /NODE_ENV/,
      );
    });
  });

  describe('PORT', () => {
    it('accepts the edges of the TCP range', () => {
      expect(validateEnv({ ...baseEnv, PORT: '1' }).port).toBe(1);
      expect(validateEnv({ ...baseEnv, PORT: '65535' }).port).toBe(65535);
    });

    it.each(['0', '65536', '-1', '8080.5', 'abc', 'NaN', 'Infinity', '1e3'])(
      'rejects %s',
      (value) => {
        expect(() => validateEnv({ ...baseEnv, PORT: value })).toThrow(/PORT/);
      },
    );
  });

  describe('FRONTEND_URL', () => {
    it.each([
      'localhost:3000',
      'ftp://localhost:3000',
      'http://localhost:3000/',
      'not a url',
    ])('rejects %s', (value) => {
      expect(() => validateEnv({ ...baseEnv, FRONTEND_URL: value })).toThrow(
        /FRONTEND_URL/,
      );
    });
  });

  describe('IDENTITY_SERVICE_URL / SELLERS_SERVICE_URL', () => {
    it('requires both — the gateway cannot run without either downstream service', () => {
      const { IDENTITY_SERVICE_URL: _a, ...withoutIdentity } = baseEnv;
      expect(() => validateEnv(withoutIdentity)).toThrow(
        /IDENTITY_SERVICE_URL/,
      );

      const { SELLERS_SERVICE_URL: _b, ...withoutSellers } = baseEnv;
      expect(() => validateEnv(withoutSellers)).toThrow(/SELLERS_SERVICE_URL/);
    });

    it('strips a trailing slash from both', () => {
      const config = validateEnv({
        ...baseEnv,
        IDENTITY_SERVICE_URL: 'http://localhost:3001/',
        SELLERS_SERVICE_URL: 'http://localhost:3002/',
      });
      expect(config.identityServiceUrl).toBe('http://localhost:3001');
      expect(config.sellersServiceUrl).toBe('http://localhost:3002');
    });

    it('rejects a non-http(s) URL', () => {
      expect(() =>
        validateEnv({ ...baseEnv, IDENTITY_SERVICE_URL: 'ftp://localhost' }),
      ).toThrow(/IDENTITY_SERVICE_URL/);
    });
  });

  describe('rate limit', () => {
    it('accepts custom window/max', () => {
      const config = validateEnv({
        ...baseEnv,
        RATE_LIMIT_WINDOW_MS: '30000',
        RATE_LIMIT_MAX: '50',
      });
      expect(config.rateLimit).toEqual({ windowMs: 30_000, max: 50 });
    });

    it('rejects a max below 1', () => {
      expect(() => validateEnv({ ...baseEnv, RATE_LIMIT_MAX: '0' })).toThrow(
        /RATE_LIMIT_MAX/,
      );
    });
  });
});
