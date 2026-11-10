import { buildProxyRoutes } from './proxy-routes';

const targets = {
  identityServiceUrl: 'http://localhost:3001',
  sellersServiceUrl: 'http://localhost:3002',
  catalogServiceUrl: 'http://localhost:3003',
  ordersServiceUrl: 'http://localhost:3004',
};

describe('buildProxyRoutes', () => {
  it.each([
    ['admin/access', 3001], ['admin/reports', 3004], ['admin/finance', 3004], ['me/activity-payments', 3004],
    ['activities', 3003], ['seller/activities', 3003], ['admin/activities', 3003],
    ['me/enrollments', 3003], ['public/analytics', 3003], ['admin/analytics', 3003],
  ])('routes new %s domain to port %s', (path, port) => {
    const routes = buildProxyRoutes(targets);
    expect(routes.find(route => route.mountPath === `/api/v1/${path}`)?.targetBaseUrl)
      .toBe(`http://localhost:${port}/api/v1/${path}`);
    if (String(path).startsWith('seller/')) expect(routes.findIndex(route => route.mountPath === `/api/v1/${path}`))
      .toBeLessThan(routes.findIndex(route => route.mountPath === '/api/v1/seller'));
  });
  it('builds a target that keeps the mount path, per http-proxy-middleware v3 rules', () => {
    const routes = buildProxyRoutes(targets);
    const auth = routes.find((r) => r.mountPath === '/api/v1/auth');

    expect(auth?.targetBaseUrl).toBe('http://localhost:3001/api/v1/auth');
  });

  it('routes seller and admin/sellers traffic to sellers-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller')?.targetBaseUrl,
    ).toBe('http://localhost:3002/api/v1/seller');
    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/sellers')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3002/api/v1/admin/sellers');
  });

  it('routes admin/categories traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/categories')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/admin/categories');
  });

  it('routes admin/products traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/products')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/admin/products');
  });

  it('routes admin/orders traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/orders')?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/admin/orders');
  });

  it('routes admin/customers traffic to identity-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/customers')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3001/api/v1/admin/customers');
  });

  it('routes admin/admins traffic to identity-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/admins')?.targetBaseUrl,
    ).toBe('http://localhost:3001/api/v1/admin/admins');
  });

  it('routes seller/products traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/products')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/seller/products');
  });

  it('routes seller/categories traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/categories')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/seller/categories');
  });

  it('registers /api/v1/seller/products, /api/v1/seller/categories, /api/v1/seller/orders, /api/v1/seller/reviews, /api/v1/seller/coupons, /api/v1/seller/claims, /api/v1/seller/returns and /api/v1/seller/disputes before the broader /api/v1/seller mount', () => {
    // Express matches app.use() mounts in registration order — if the
    // broader '/api/v1/seller' mount were registered first, every request
    // under '/api/v1/seller/products', '/api/v1/seller/categories',
    // '/api/v1/seller/orders', '/api/v1/seller/reviews',
    // '/api/v1/seller/coupons', '/api/v1/seller/claims',
    // '/api/v1/seller/returns' or '/api/v1/seller/disputes' would
    // incorrectly hit sellers-service instead of catalog-service /
    // orders-service.
    const routes = buildProxyRoutes(targets);
    const mountPaths = routes.map((r) => r.mountPath);

    const productsIndex = mountPaths.indexOf('/api/v1/seller/products');
    const categoriesIndex = mountPaths.indexOf('/api/v1/seller/categories');
    const ordersIndex = mountPaths.indexOf('/api/v1/seller/orders');
    const reviewsIndex = mountPaths.indexOf('/api/v1/seller/reviews');
    const couponsIndex = mountPaths.indexOf('/api/v1/seller/coupons');
    const claimsIndex = mountPaths.indexOf('/api/v1/seller/claims');
    const returnsIndex = mountPaths.indexOf('/api/v1/seller/returns');
    const disputesIndex = mountPaths.indexOf('/api/v1/seller/disputes');
    const sellerIndex = mountPaths.indexOf('/api/v1/seller');

    expect(productsIndex).toBeGreaterThanOrEqual(0);
    expect(categoriesIndex).toBeGreaterThanOrEqual(0);
    expect(ordersIndex).toBeGreaterThanOrEqual(0);
    expect(reviewsIndex).toBeGreaterThanOrEqual(0);
    expect(couponsIndex).toBeGreaterThanOrEqual(0);
    expect(claimsIndex).toBeGreaterThanOrEqual(0);
    expect(returnsIndex).toBeGreaterThanOrEqual(0);
    expect(disputesIndex).toBeGreaterThanOrEqual(0);
    expect(sellerIndex).toBeGreaterThanOrEqual(0);
    expect(productsIndex).toBeLessThan(sellerIndex);
    expect(categoriesIndex).toBeLessThan(sellerIndex);
    expect(ordersIndex).toBeLessThan(sellerIndex);
    expect(reviewsIndex).toBeLessThan(sellerIndex);
    expect(couponsIndex).toBeLessThan(sellerIndex);
    expect(claimsIndex).toBeLessThan(sellerIndex);
    expect(returnsIndex).toBeLessThan(sellerIndex);
    expect(disputesIndex).toBeLessThan(sellerIndex);
  });

  it('routes seller/coupons traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/coupons')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/seller/coupons');
  });

  it('routes admin/coupons traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/coupons')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/admin/coupons');
  });

  it('routes admin/returns traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/returns')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/admin/returns');
  });

  it('routes seller/claims traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/claims')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/seller/claims');
  });

  it('routes seller/returns traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/returns')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/seller/returns');
  });

  it('routes seller/disputes traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);
    const disputes = routes.find(
      (r) => r.mountPath === '/api/v1/seller/disputes',
    );

    expect(disputes?.serviceName).toBe('orders-service');
    expect(disputes?.targetBaseUrl).toBe(
      'http://localhost:3004/api/v1/seller/disputes',
    );
  });

  it('routes admin/claims traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/claims')?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/admin/claims');
  });

  it('routes admin/disputes traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/disputes')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/admin/disputes');
  });

  it('routes admin/contents traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/admin/contents')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/admin/contents');
  });

  it('routes seller/orders traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/orders')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/seller/orders');
  });

  it('routes seller/reviews traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/seller/reviews')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/seller/reviews');
  });

  it('routes orders traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/orders')?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/orders');
  });

  it('routes public/products traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/public/products')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/public/products');
  });

  it('routes public/categories traffic to catalog-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/public/categories')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3003/api/v1/public/categories');
  });

  it('routes public/reviews traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/public/reviews')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/public/reviews');
  });

  it('routes payments/webhooks traffic to orders-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/payments/webhooks')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3004/api/v1/payments/webhooks');
  });

  it('routes public/sellers traffic to sellers-service', () => {
    const routes = buildProxyRoutes(targets);

    expect(
      routes.find((r) => r.mountPath === '/api/v1/public/sellers')
        ?.targetBaseUrl,
    ).toBe('http://localhost:3002/api/v1/public/sellers');
  });

  it('never routes /api/v1/internal or /api/v1/health (served natively / blocked)', () => {
    const routes = buildProxyRoutes(targets);
    const mountPaths = routes.map((r) => r.mountPath);

    expect(mountPaths.some((p) => p.includes('/internal'))).toBe(false);
    expect(mountPaths.some((p) => p.includes('/health'))).toBe(false);
  });
});
