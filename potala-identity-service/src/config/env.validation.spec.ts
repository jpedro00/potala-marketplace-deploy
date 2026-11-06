import { validateEnv, readAdminSeedCredentials } from './env.validation';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://potala:potala@127.0.0.1:5432/potala_test',
  FRONTEND_URL: 'http://localhost:3000',
  PORT: '3001',
  INTERNAL_API_KEY: 'test-internal-api-key-not-a-real-secret',
};

describe('validateEnv', () => {
  it('starts without ADMIN_PASSWORD', () => {
    const config = validateEnv(baseEnv);
    expect(config.port).toBe(3001);
    expect(config.frontendUrl).toBe('http://localhost:3000');
    expect(config.throttle.authLimit).toBe(5);
    expect(config.internalApiKey).toBe(baseEnv.INTERNAL_API_KEY);
  });

  it('keeps the current full configuration valid', () => {
    const config = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      DIRECT_URL: 'postgresql://potala:potala@127.0.0.1:5432/potala_test',
      SESSION_COOKIE_NAME: 'potala_session',
      SESSION_COOKIE_SECURE: 'false',
      SESSION_TTL_DAYS: '7',
      SWAGGER_ENABLED: 'true',
      LOG_HTTP_BODY: 'false',
      THROTTLE_TTL_MS: '60000',
      THROTTLE_LIMIT: '60',
      AUTH_THROTTLE_LIMIT: '5',
      INTERNAL_THROTTLE_LIMIT: '600',
      SELLERS_SERVICE_URL: 'http://localhost:3002',
      SELLERS_SERVICE_API_KEY: 'sellers-shared-secret',
      SELLERS_SERVICE_TIMEOUT_MS: '5000',
    });

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3001,
      databaseUrl: baseEnv.DATABASE_URL,
      frontendUrl: 'http://localhost:3000',
      swaggerEnabled: true,
      logHttpBody: false,
      session: {
        cookieName: 'potala_session',
        ttlDays: 7,
        cookieSecure: false,
      },
      throttle: { ttlMs: 60_000, limit: 60, authLimit: 5, internalLimit: 600 },
      internalApiKey: baseEnv.INTERNAL_API_KEY,
      sellersService: {
        baseUrl: 'http://localhost:3002',
        apiKey: 'sellers-shared-secret',
        timeoutMs: 5000,
      },
    });
  });

  it('applies every default when only the required variables are set', () => {
    const config = validateEnv(baseEnv);

    expect(config).toEqual({
      nodeEnv: 'test',
      port: 3001,
      databaseUrl: baseEnv.DATABASE_URL,
      frontendUrl: 'http://localhost:3000',
      swaggerEnabled: true,
      logHttpBody: false,
      session: {
        cookieName: 'potala_session',
        ttlDays: 7,
        cookieSecure: false,
      },
      throttle: { ttlMs: 60_000, limit: 60, authLimit: 5, internalLimit: 600 },
      internalApiKey: baseEnv.INTERNAL_API_KEY,
      sellersService: { baseUrl: '', apiKey: '', timeoutMs: 5000 },
    });
  });

  it('never enables HTTP body logging in production', () => {
    const config = validateEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      LOG_HTTP_BODY: 'true',
    });
    expect(config.logHttpBody).toBe(false);
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
    it('accepts 3001', () => {
      expect(validateEnv({ ...baseEnv, PORT: '3001' }).port).toBe(3001);
    });

    it('accepts the edges of the TCP range', () => {
      expect(validateEnv({ ...baseEnv, PORT: '1' }).port).toBe(1);
      expect(validateEnv({ ...baseEnv, PORT: '65535' }).port).toBe(65535);
    });

    it.each(['0', '65536', '-1', '3001.5', 'abc', 'NaN', 'Infinity', '1e3'])(
      'rejects %s',
      (value) => {
        expect(() => validateEnv({ ...baseEnv, PORT: value })).toThrow(/PORT/);
      },
    );
  });

  describe('INTERNAL_API_KEY', () => {
    it('requires it', () => {
      const { INTERNAL_API_KEY: _omitted, ...withoutKey } = baseEnv;
      expect(() => validateEnv(withoutKey)).toThrow(/INTERNAL_API_KEY/);
    });

    it('rejects a key shorter than 16 characters', () => {
      expect(() =>
        validateEnv({ ...baseEnv, INTERNAL_API_KEY: 'short' }),
      ).toThrow(/INTERNAL_API_KEY/);
    });
  });

  describe('SELLERS_SERVICE_URL / SELLERS_SERVICE_API_KEY', () => {
    it('allows both empty (sellers-service does not exist yet)', () => {
      const config = validateEnv(baseEnv);
      expect(config.sellersService.baseUrl).toBe('');
      expect(config.sellersService.apiKey).toBe('');
    });

    it('rejects URL set without API key', () => {
      expect(() =>
        validateEnv({
          ...baseEnv,
          SELLERS_SERVICE_URL: 'http://localhost:3002',
        }),
      ).toThrow(/SELLERS_SERVICE_URL and SELLERS_SERVICE_API_KEY/);
    });

    it('rejects API key set without URL', () => {
      expect(() =>
        validateEnv({ ...baseEnv, SELLERS_SERVICE_API_KEY: 'secret' }),
      ).toThrow(/SELLERS_SERVICE_URL and SELLERS_SERVICE_API_KEY/);
    });

    it('strips a trailing slash from the configured URL', () => {
      const config = validateEnv({
        ...baseEnv,
        SELLERS_SERVICE_URL: 'http://localhost:3002/',
        SELLERS_SERVICE_API_KEY: 'secret',
      });
      expect(config.sellersService.baseUrl).toBe('http://localhost:3002');
    });
  });

  describe('SESSION_TTL_DAYS', () => {
    it('defaults to 7', () => {
      expect(validateEnv(baseEnv).session.ttlDays).toBe(7);
    });

    it.each(['1', '30', '400', '3650'])(
      'accepts the positive integer %s without an arbitrary ceiling',
      (value) => {
        expect(
          validateEnv({ ...baseEnv, SESSION_TTL_DAYS: value }).session.ttlDays,
        ).toBe(Number(value));
      },
    );

    it.each(['-1', '0', '0.5', 'Infinity', 'NaN'])('rejects %s', (value) => {
      expect(() =>
        validateEnv({ ...baseEnv, SESSION_TTL_DAYS: value }),
      ).toThrow(/SESSION_TTL_DAYS/);
    });
  });

  describe('booleans', () => {
    it.each([
      ['true', true],
      ['TRUE', true],
      ['1', true],
      ['false', false],
      ['FALSE', false],
      ['0', false],
    ] as const)('parses %s', (value, expected) => {
      expect(
        validateEnv({ ...baseEnv, SWAGGER_ENABLED: value }).swaggerEnabled,
      ).toBe(expected);
    });

    it.each(['yes', 'no', 'on', 'off', 'sim', '2', 'truthy'])(
      'rejects the ambiguous value %s instead of coercing it',
      (value) => {
        expect(() =>
          validateEnv({ ...baseEnv, SWAGGER_ENABLED: value }),
        ).toThrow(/SWAGGER_ENABLED/);
      },
    );
  });

  describe('database URLs', () => {
    it('requires DATABASE_URL', () => {
      const { DATABASE_URL: _omitted, ...withoutDatabase } = baseEnv;
      expect(() => validateEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
    });

    it('rejects a non-postgres DATABASE_URL', () => {
      expect(() =>
        validateEnv({ ...baseEnv, DATABASE_URL: 'mysql://user@host:3306/db' }),
      ).toThrow(/DATABASE_URL/);
    });

    it.each([
      ['wrong protocol', 'mysql://potala:sup3rs3cr3t@db.internal:3306/potala'],
      ['unparseable value', 'potala :sup3rs3cr3t@ db.internal'],
    ])('never echoes credentials in the %s error', (_case, value) => {
      let message = '';
      try {
        validateEnv({ ...baseEnv, DIRECT_URL: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('DIRECT_URL');
      expect(message).not.toContain('sup3rs3cr3t');
      expect(message).not.toContain('db.internal');
    });
  });

  describe('FRONTEND_URL', () => {
    it('keeps http and localhost working', () => {
      expect(
        validateEnv({ ...baseEnv, FRONTEND_URL: 'http://localhost:3000' })
          .frontendUrl,
      ).toBe('http://localhost:3000');
    });

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

  it('requires admin credentials only for the seed helper', () => {
    expect(() => readAdminSeedCredentials({})).toThrow(/ADMIN_EMAIL/);
    expect(
      readAdminSeedCredentials({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'placeholder-not-a-secret',
        ADMIN_NAME: 'Admin',
      }),
    ).toEqual({
      email: 'admin@example.com',
      password: 'placeholder-not-a-secret',
      name: 'Admin',
    });
  });
});
