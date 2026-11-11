/**
 * Same mechanism as sellers-service's redact.ts, trimmed to the keys that
 * can actually appear in this service's own request bodies (product/variant
 * fields carry no personal data — title, sku, price, quantity are all fine
 * to log as-is) plus the generic auth-adjacent keys any service might see.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'sessiontoken',
  'cookie',
  'cookies',
  'authorization',
  'x-internal-api-key',
  'name',
  'email',
  'subject',
  'message',
  'meetingurl',
]);

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redactSensitive(nested);
      }
    }
    return output;
  }

  return value;
}
