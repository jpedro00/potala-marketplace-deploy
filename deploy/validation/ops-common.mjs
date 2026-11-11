import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export function localOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password) throw new Error('Only explicit loopback HTTP targets are permitted');
  return u.origin;
}
export async function save(path, data) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + '\n'); }
export function percentile(values, p) { return values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null; }
