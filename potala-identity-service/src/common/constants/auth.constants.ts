export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

/** Touch Session.lastUsedAt at most once every 15 minutes to avoid write amplification. */
export const SESSION_LAST_USED_TOUCH_MS = 15 * 60 * 1000;

export const API_GLOBAL_PREFIX = 'api/v1';

/** Header carrying the shared secret on every /internal/* call. */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/** Path segment used to skip CSRF-origin checks and apply the internal throttle group. */
export const INTERNAL_PATH_SEGMENT = '/internal/';

/** Path segment used to route requests into the lenient /auth throttle group. */
export const AUTH_PATH_SEGMENT = '/auth';
