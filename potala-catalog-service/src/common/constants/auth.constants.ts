export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

export const API_GLOBAL_PREFIX = 'api/v1';

/**
 * Header carrying the shared secret on every /internal/* call — both
 * outbound (to identity-service's and sellers-service's own /internal/*
 * routes) and, as of orders-service's arrival, inbound (this service's own
 * InternalApiKeyGuard, below).
 */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/**
 * Path segment used to skip CSRF-origin checks and apply the internal
 * throttle group on this service's own /internal/* routes. Added when
 * orders-service became this service's first internal-API consumer
 * (product/variant resolution + inventory reserve/release/commit) — see
 * modules/internal and docs/internal-api-contract.md. Same constant, same
 * purpose, as sellers-service's own INTERNAL_PATH_SEGMENT.
 */
export const INTERNAL_PATH_SEGMENT = '/internal/';
