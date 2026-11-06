export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: AppEnvironment;
  port: number;
  databaseUrl: string;
  frontendUrl: string;
  swaggerEnabled: boolean;
  logHttpBody: boolean;
  session: {
    cookieName: string;
    ttlDays: number;
    cookieSecure: boolean;
  };
  throttle: {
    ttlMs: number;
    limit: number;
    authLimit: number;
    internalLimit: number;
  };
  /** Shared secret every caller of /internal/* must present in x-internal-api-key. */
  internalApiKey: string;
  /**
   * sellers-service is not built yet. baseUrl/apiKey are empty until then;
   * SellersServiceClient fails fast with a clear 503 instead of attempting a
   * request to an unconfigured target.
   */
  sellersService: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
}

export const APP_CONFIG = 'APP_CONFIG';
