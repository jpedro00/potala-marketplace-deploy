const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'sessiontoken',
  'cookie',
  'cookies',
  'authorization',
  'x-internal-api-key',
  'email',
  'storeemail',
  'phone',
  'documentnumber',
  'cpf',
  'cnpj',
  'reason',
  'legalname',
  'tradename',
  'ownername',
  'name',
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
