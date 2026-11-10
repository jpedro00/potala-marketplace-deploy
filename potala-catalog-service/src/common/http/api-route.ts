/** Match only the API path, never a query parameter or a partial resource name. */
export function hasApiRoutePrefix(url: string, prefix: string): boolean {
  const pathname = url.split('?')[0];
  return pathname.startsWith('/api/v1' + prefix) || pathname.startsWith(prefix);
}
