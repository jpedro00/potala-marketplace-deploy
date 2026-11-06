export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

export const API_GLOBAL_PREFIX = 'api/v1';

/** Header carrying the shared secret on every /internal/* call. */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/** Path segment used to skip CSRF-origin checks and apply the internal throttle group. */
export const INTERNAL_PATH_SEGMENT = '/internal/';
