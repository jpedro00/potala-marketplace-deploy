export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: AppEnvironment;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  swaggerEnabled: boolean;
  logHttpBody: boolean;
  /**
   * This service never issues or sets the session cookie itself (only
   * identity-service does, on login). It only needs to know which cookie
   * name to read off incoming requests before forwarding the raw token to
   * IdentityServiceClient.introspectSession — same reasoning as
   * sellers-service's own `session` config.
   */
  session: {
    cookieName: string;
  };
  throttle: {
    ttlMs: number;
    limit: number;
    /** Only used for this service's own /internal/* routes — see internalApiKey below. */
    internalLimit: number;
  };
  /**
   * Shared secret every caller of this service's own /internal/* routes must
   * present (InternalApiKeyGuard). Added when orders-service became this
   * service's first internal-API consumer — see modules/internal.
   */
  internalApiKey: string;
  /**
   * Both are hard dependencies: this service authenticates nothing without
   * identity-service (no local session table), and cannot resolve a seller's
   * own products without sellers-service (no local seller-membership table
   * either).
   */
  identityService: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
  sellersService: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
}

export const APP_CONFIG = 'APP_CONFIG';
