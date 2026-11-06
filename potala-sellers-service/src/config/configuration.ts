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
   * IdentityServiceClient.introspectSession — so unlike identity-service's
   * own `session` config, there is no ttlDays/cookieSecure here.
   */
  session: {
    cookieName: string;
  };
  throttle: {
    ttlMs: number;
    limit: number;
    internalLimit: number;
  };
  /** Shared secret every caller of this service's own /internal/* must present. */
  internalApiKey: string;
  /**
   * Unlike identity-service's optional SellersServiceClient config,
   * identity-service is a hard dependency for every authenticated route in
   * this service (there is no local session table to fall back on) — so
   * these are required, not optional.
   */
  identityService: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
}

export const APP_CONFIG = 'APP_CONFIG';
