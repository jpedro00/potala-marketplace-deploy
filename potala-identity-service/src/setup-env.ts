process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://potala:potala@127.0.0.1:5432/potala_test';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.PORT ??= '3001';
process.env.SESSION_COOKIE_NAME ??= 'potala_session';
process.env.SESSION_TTL_DAYS ??= '7';
process.env.SESSION_COOKIE_SECURE ??= 'false';
process.env.SWAGGER_ENABLED ??= 'false';
process.env.LOG_HTTP_BODY ??= 'false';
process.env.THROTTLE_TTL_MS ??= '60000';
process.env.THROTTLE_LIMIT ??= '60';
process.env.AUTH_THROTTLE_LIMIT ??= '5';
process.env.INTERNAL_THROTTLE_LIMIT ??= '600';
process.env.INTERNAL_API_KEY ??= 'test-internal-api-key-not-a-real-secret';
process.env.SELLERS_SERVICE_URL ??= '';
process.env.SELLERS_SERVICE_API_KEY ??= '';
