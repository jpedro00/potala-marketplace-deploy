// Read-only bounded inventory: robots, sitemap index, page links; never changes redirect rules.
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { save } from './ops-common.mjs';
const origin = 'https://www.institutopotala.com';
const limit = 30;
const discovered = new Map([[origin + '/', 'seed']]);
const records = [];
const visited = new Set();
function add(value, source) {
  try { const u = new URL(value.replaceAll('&amp;', '&'), source); u.hash = '';
    if (u.origin === origin && !u.search && !/\.(jpg|png|pdf|jpeg|webp|gif|svg)$/i.test(u.pathname) && !discovered.has(u.href)) discovered.set(u.href, source);
  } catch { /* Ignore malformed external links. */ }
}
async function read(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { 'user-agent': 'PotalaMigrationInventory/1.0' } });
  const body = await r.text();
  return { status: r.status, body, sha256: createHash('sha256').update(body).digest('hex') };
}
const robots = await read(origin + '/robots.txt');
// Stop if the wildcard crawler is denied. Specific bot groups do not apply to this agent.
const wildcard = robots.body.split(/(?=User-agent:)/i).filter(s=>/^User-agent:\s*\*\s*$/im.test(s)).join('\n');
if (robots.status !== 200 || /^Disallow:\s*\/\s*$/im.test(wildcard)) throw new Error('Robots unavailable or denies crawl');
const disallowed = [...wildcard.matchAll(/^Disallow:\s*(\S+)/gim)].map(m=>m[1]);
const sitemaps = [...robots.body.matchAll(/^Sitemap:\s*(\S+)/gim)].map(m=>m[1]);
const sitemapEvidence = [];
for (const url of sitemaps) {
  if (new URL(url).origin !== origin) continue;
  const result = await read(url); sitemapEvidence.push({url,status:result.status,sha256:result.sha256});
  for (const m of result.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (m[1].endsWith('.xml') && new URL(m[1]).origin === origin && sitemapEvidence.length < 5) {
      const child=await read(m[1]); sitemapEvidence.push({url:m[1],status:child.status,sha256:child.sha256});
      for (const p of child.body.matchAll(/<loc>([^<]+)<\/loc>/g)) add(p[1],m[1]);
    } else add(m[1],url);
  }
}
const priority = ['/', '/cursos', '/programacao', '/quemsomos', '/contato', '/loja'];
const crawlQueue = [...discovered].sort((a,b)=>(priority.includes(new URL(a[0]).pathname)?priority.indexOf(new URL(a[0]).pathname):99)-(priority.includes(new URL(b[0]).pathname)?priority.indexOf(new URL(b[0]).pathname):99));
for (const [url, source] of crawlQueue) {
  if (records.length >= limit) break;
  const path = new URL(url).pathname;
  if (visited.has(url) || disallowed.some(p=>!p.includes('*') && path.startsWith(p))) continue;
  visited.add(url);
  try {
    const r=await read(url);
    const title=r.body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
    records.push({url,discoveredFrom:source,status:r.status,title,sha256:r.sha256,decision:'pending_content_correspondence',destination:null});
    if (r.status===200) for (const m of r.body.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) add(m[1],url);
  } catch(e) { records.push({url,discoveredFrom:source,error:e.message,decision:'pending_fetch',destination:null}); }
  await delay(300);
}
await save('artifacts/ops-legacy-inventory.json',{checkedAt:new Date().toISOString(),origin,limit,robots:{url:origin+'/robots.txt',status:robots.status,sha256:robots.sha256,wildcard},sitemaps:sitemapEvidence,discovered:discovered.size,bounded:records.length<discovered.size,discoveredUrls:[...discovered].map(([url,discoveredFrom])=>({url,discoveredFrom})),records});
console.log(JSON.stringify({fetched:records.length,discovered:discovered.size,pending:records.length,approvedRedirects:0}));
