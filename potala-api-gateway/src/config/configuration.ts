export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: AppEnvironment;
  port: number;
  frontendUrl: string;
  /**
   * The gateway has no database and no schema of its own — it is a pure
   * reverse proxy in front of identity-service, sellers-service,
   * catalog-service and orders-service. All four are required (unlike
   * identity-service's optional sellers-service config): the gateway's
   * entire job is routing to known, live services.
   */
  identityServiceUrl: string;
  sellersServiceUrl: string;
  catalogServiceUrl: string;
  ordersServiceUrl: string;
  proxyTimeoutMs: number;
  /** Shorter than proxyTimeoutMs on purpose: a readiness probe should fail fast. */
  healthCheckTimeoutMs: number;
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export const APP_CONFIG = 'APP_CONFIG';
