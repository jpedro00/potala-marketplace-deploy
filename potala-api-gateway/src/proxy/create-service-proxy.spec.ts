import express from 'express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createServiceProxy } from './create-service-proxy';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('client IP through the public gateway', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('preserves distinct client trackers after the extra internal proxy hop', async () => {
    const upstream = express();
    upstream.set('trust proxy', 1);
    upstream.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const upstreamServer = createServer(upstream);
    servers.push(upstreamServer);
    const target = await listen(upstreamServer);

    const gateway = express();
    gateway.set('trust proxy', 1);
    gateway.use(
      createServiceProxy({ serviceName: 'test', target, timeoutMs: 2000 }),
    );
    const gatewayServer = createServer(gateway);
    servers.push(gatewayServer);
    const origin = await listen(gatewayServer);

    for (const ip of ['203.0.113.27', '203.0.113.28']) {
      const response = await fetch(`${origin}/ip`, {
        headers: { 'x-forwarded-for': `198.51.100.99, ${ip}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ip });
    }
  });
});
