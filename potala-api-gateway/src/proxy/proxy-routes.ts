export interface ProxyRoute {
  /** Mount path, e.g. "/api/v1/auth". Also becomes part of the upstream target — see create-service-proxy.ts. */
  mountPath: string;
  serviceName: string;
  targetBaseUrl: string;
}

/**
 * Static routing table: which URL prefix goes to which downstream service.
 * Order matters where prefixes overlap (more specific first) — Express
 * matches app.use() mounts in registration order, so "/api/v1/admin/sellers"
 * must be registered before any future, broader "/api/v1/admin" mount, and
 * "/api/v1/seller/products", "/api/v1/seller/categories" (catalog-service)
 * and "/api/v1/seller/orders", "/api/v1/seller/reviews", "/api/v1/seller/coupons",
 * "/api/v1/seller/claims", "/api/v1/seller/returns" and
 * "/api/v1/seller/disputes" (orders-service)
 * must all be registered before the broader "/api/v1/seller"
 * (sellers-service) below them — the three services own different
 * sub-resources under the same "/seller" prefix (sellers-service:
 * onboarding/status; catalog-service: products, categories; orders-service:
 * seller order views + fulfillment status writes, review views, coupons,
 * and now claims/returns/disputes do pós-venda), there is no single
 * service that owns "/api/v1/seller/*" as a whole.
 *
 * "/api/v1/admin/sellers" (sellers-service) and "/api/v1/admin/categories"
 * (catalog-service, new this session) are both specific leaf prefixes with
 * no broader "/api/v1/admin" mount registered anywhere — so, unlike the
 * "/seller" prefixes above, their relative order does not matter today. The
 * note below about a future broader "/admin" mount still applies if one is
 * ever added.
 *
 * Deliberately NOT included here: "/api/v1/internal/*" (blocked entirely —
 * see block-internal.middleware.ts, mounted before these routes) and
 * "/api/v1/health" (served natively by this gateway's own HealthController,
 * not proxied — see modules/health).
 *
 * When catalog-service ever grows its own "/admin/*" routes, this flat
 * prefix-per-service model stops being enough for "/admin" specifically and
 * route resolution needs to move to a per-resource convention there too —
 * noted here rather than solved speculatively now. "/seller" already made
 * that jump today, for products and categories; "/admin" just made it too,
 * for sellers and categories.
 */
export interface ProxyRouteTargets {
  identityServiceUrl: string;
  sellersServiceUrl: string;
  catalogServiceUrl: string;
  ordersServiceUrl: string;
}

export function buildProxyRoutes({
  identityServiceUrl,
  sellersServiceUrl,
  catalogServiceUrl,
  ordersServiceUrl,
}: ProxyRouteTargets): ProxyRoute[] {
  return [
    { mountPath: '/api/v1/public/contact', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/public/contact` },
    { mountPath: '/api/v1/admin/contacts', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/contacts` },
    { mountPath: '/api/v1/admin/access', serviceName: 'identity-service', targetBaseUrl: `${identityServiceUrl}/api/v1/admin/access` },
    { mountPath: '/api/v1/admin/reports', serviceName: 'orders-service', targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/reports` },
    { mountPath: '/api/v1/admin/finance', serviceName: 'orders-service', targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/finance` },
    { mountPath: '/api/v1/me/activity-payments', serviceName: 'orders-service', targetBaseUrl: `${ordersServiceUrl}/api/v1/me/activity-payments` },
    { mountPath: '/api/v1/activities', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/activities` },
    { mountPath: '/api/v1/seller/activities', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/seller/activities` },
    { mountPath: '/api/v1/admin/activities', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/activities` },
    { mountPath: '/api/v1/me/enrollments', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/me/enrollments` },
    { mountPath: '/api/v1/public/analytics', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/public/analytics` },
    { mountPath: '/api/v1/admin/analytics', serviceName: 'catalog-service', targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/analytics` },

    {
      mountPath: '/api/v1/auth',
      serviceName: 'identity-service',
      targetBaseUrl: `${identityServiceUrl}/api/v1/auth`,
    },
    {
      mountPath: '/api/v1/customers',
      serviceName: 'identity-service',
      targetBaseUrl: `${identityServiceUrl}/api/v1/customers`,
    },
    {
      // Must be registered before the broader '/api/v1/seller' mount below
      // — see the routing-table comment above for why.
      mountPath: '/api/v1/seller/products',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/seller/products`,
    },
    {
      // Same reasoning as '/api/v1/seller/products' just above — new this
      // session, backs the seller "new product" form's category picker.
      mountPath: '/api/v1/seller/categories',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/seller/categories`,
    },
    {
      // Same reasoning as '/api/v1/seller/products' just above — seller
      // order views (Fase 3, "pedidos do vendedor") + fulfillment status
      // writes (28/09, "painel Entregas").
      mountPath: '/api/v1/seller/orders',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/orders`,
    },
    {
      // Must be registered before the broader '/api/v1/seller' mount
      // below, same reasoning as '/api/v1/seller/orders' just above — new
      // this session, backs the seller "Avaliações" panel (ver
      // status-migracao-microservicos.md).
      mountPath: '/api/v1/seller/reviews',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/reviews`,
    },
    {
      // Must be registered before the broader '/api/v1/seller' mount
      // below, same reasoning as '/api/v1/seller/orders' and
      // '/api/v1/seller/reviews' just above -- pedido de Arthur, urgente
      // (ver status-migracao-microservicos.md). Read-only (SellerCouponsController).
      mountPath: '/api/v1/seller/coupons',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/coupons`,
    },
    {
      // Must be registered before the broader '/api/v1/seller' mount
      // below, mesmo raciocínio de '/api/v1/seller/orders' acima --
      // pós-venda do vendedor (SellerClaimsController, ver
      // plano-pos-venda-reclamacoes-devolucoes-disputas.md).
      mountPath: '/api/v1/seller/claims',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/claims`,
    },
    {
      // Mesmo raciocínio de '/api/v1/seller/claims' acima -- abertura de
      // disputa a partir de uma Return pelo vendedor (também
      // SellerClaimsController).
      mountPath: '/api/v1/seller/returns',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/returns`,
    },
    {
      // Must be registered before the broader '/api/v1/seller' mount
      // below, mesmo raciocínio de '/api/v1/seller/claims' e
      // '/api/v1/seller/returns' acima -- leitura de disputa do vendedor
      // (SellerClaimsController.getDispute -> DisputesService.getForSeller),
      // pertence ao orders-service, nunca ao sellers-service. O prefixo
      // cobre também o detalhe ('/api/v1/seller/disputes/:id'): o proxy
      // encaminha tudo que vem depois do mountPath, sem precisar de um
      // mount separado para o ':id' (ver create-service-proxy.ts).
      mountPath: '/api/v1/seller/disputes',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/seller/disputes`,
    },
    {
      mountPath: '/api/v1/seller',
      serviceName: 'sellers-service',
      targetBaseUrl: `${sellersServiceUrl}/api/v1/seller`,
    },
    {
      mountPath: '/api/v1/admin/sellers',
      serviceName: 'sellers-service',
      targetBaseUrl: `${sellersServiceUrl}/api/v1/admin/sellers`,
    },
    {
      // New this session — backs the admin "gerenciar categorias" screen.
      // No overlap with '/api/v1/admin/sellers' above (different literal
      // leaf prefix), so registration order between the two doesn't matter.
      mountPath: '/api/v1/admin/categories',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/categories`,
    },
    {
      // "Todos os produtos" (admin) -- pedido de Arthur ("pode seguir com
      // esse"), ver status-migracao-microservicos.md. Distinct leaf prefix
      // from every other '/api/v1/admin/*' entry (including
      // '/api/v1/admin/categories' just above, same catalog-service),
      // order-independent, same reasoning as those.
      mountPath: '/api/v1/admin/products',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/products`,
    },
    {
      // New this session — backs the admin Financeiro screen (ver
      // status-migracao-microservicos.md). Distinct leaf prefix from
      // '/api/v1/admin/sellers' and '/api/v1/admin/categories' above, so
      // registration order between the three does not matter, same
      // reasoning as the comment on those two.
      mountPath: '/api/v1/admin/orders',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/orders`,
    },
    {
      // No overlap with any prefix above — orders-service owns the whole
      // "/api/v1/orders/*" prefix, unlike "/seller" — so registration order
      // relative to the others does not matter here.
      mountPath: '/api/v1/orders',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/orders`,
    },
    {
      // New — backs the admin "Clientes" screen (ver
      // status-migracao-microservicos.md). Distinct leaf prefix from
      // '/api/v1/admin/sellers'/'/api/v1/admin/categories'/'/api/v1/admin/orders'
      // above, so registration order between them does not matter, same
      // reasoning as those three. Also distinct from '/api/v1/customers'
      // above (that one is the authenticated customer's own profile;
      // this one is the admin-only list/block of every customer).
      mountPath: '/api/v1/admin/customers',
      serviceName: 'identity-service',
      targetBaseUrl: `${identityServiceUrl}/api/v1/admin/customers`,
    },
    {
      // "Cadastro de admin" (ver status-migracao-microservicos.md) -- só
      // um admin já autenticado consegue cadastrar outro, nunca uma rota
      // pública (AdminController de identity-service exige Role.ADMIN em
      // toda a classe). Distinct leaf prefix de '/api/v1/admin/customers'
      // acima e de todo outro '/api/v1/admin/*', order-independent.
      mountPath: '/api/v1/admin/admins',
      serviceName: 'identity-service',
      targetBaseUrl: `${identityServiceUrl}/api/v1/admin/admins`,
    },
    {
      // Pedido de Arthur, urgente (ver status-migracao-microservicos.md).
      // Distinct leaf prefix from every other '/api/v1/admin/*' entry
      // above, so registration order between them does not matter, same
      // reasoning as those.
      mountPath: '/api/v1/admin/coupons',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/coupons`,
    },
    {
      // Pedido de Arthur, urgente (ver status-migracao-microservicos.md) --
      // Fase E do roadmap pós-entrega adiantada. Distinct leaf prefix,
      // order-independent, mesmo raciocínio de '/api/v1/admin/coupons'
      // acima.
      mountPath: '/api/v1/admin/returns',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/returns`,
    },
    {
      // Pós-venda do admin (AdminClaimsController, ver
      // plano-pos-venda-reclamacoes-devolucoes-disputas.md). Distinct leaf
      // prefix from every other '/api/v1/admin/*' entry, order-independent,
      // mesmo raciocínio de '/api/v1/admin/returns' acima.
      mountPath: '/api/v1/admin/claims',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/claims`,
    },
    {
      // Mesmo raciocínio de '/api/v1/admin/claims' acima
      // (AdminDisputesController) -- decisão do admin sobre uma disputa.
      mountPath: '/api/v1/admin/disputes',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/admin/disputes`,
    },
    {
      // "Conteudos / Cursos" (admin) -- pedido de Arthur, dominio novo
      // (ver status-migracao-microservicos.md). Distinct leaf prefix from
      // every other '/api/v1/admin/*' entry above, order-independent, same
      // reasoning as those.
      mountPath: '/api/v1/admin/contents',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/admin/contents`,
    },
    {
      // New this session — public storefront (Fase 1 do plano até 05/10).
      // Unauthenticated on purpose: catalog-service's PublicProductsController
      // has no guard. No overlap with any other prefix, order-independent.
      mountPath: '/api/v1/public/products',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/public/products`,
    },
    {
      // Same reasoning as '/api/v1/public/products' just above.
      mountPath: '/api/v1/public/categories',
      serviceName: 'catalog-service',
      targetBaseUrl: `${catalogServiceUrl}/api/v1/public/categories`,
    },
    {
      // New — Fase B do roadmap pós-entrega (avaliação e reputação, ver
      // roadmap-mercado-livre.md). Unauthenticated on purpose:
      // orders-service's PublicReviewsController has no guard, same
      // reasoning as '/api/v1/public/products' above. Distinct leaf prefix
      // ("reviews", not nested under "products"/"sellers"), so it does not
      // overlap with '/api/v1/public/products' (catalog-service) or any
      // future '/api/v1/public/sellers' — order-independent.
      mountPath: '/api/v1/public/reviews',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/public/reviews`,
    },
    {
      // New this session — vitrine pública da loja (/vendedor/[slug] no
      // frontend, ver status-migracao-microservicos.md). Unauthenticated
      // on purpose: sellers-service's PublicSellersController has no
      // guard, mesma razão de '/api/v1/public/products' acima. Distinct
      // leaf prefix ("sellers"), não colide com '/api/v1/seller' (sem 's'
      // no final, singular, rota autenticada do vendedor) nem com
      // '/api/v1/admin/sellers' — order-independent.
      mountPath: '/api/v1/public/sellers',
      serviceName: 'sellers-service',
      targetBaseUrl: `${sellersServiceUrl}/api/v1/public/sellers`,
    },
    {
      // Estrutura pronta pra Fase C (pagamento real), gateway ainda nao
      // escolhido -- ver roadmap-mercado-livre.md, secao 9.
      // Unauthenticated on purpose, mesma razao de '/api/v1/public/reviews'
      // acima: orders-service's PaymentWebhooksController tem @Public()
      // porque quem chama e o gateway de pagamento, nunca um cliente
      // logado. Autenticidade do payload e responsabilidade de
      // PaymentGatewayClient.parseWebhook (assinatura/segredo especifico de
      // cada provedor), nao deste gateway. Leaf prefix distinto
      // ("payments"), order-independent.
      mountPath: '/api/v1/payments/webhooks',
      serviceName: 'orders-service',
      targetBaseUrl: `${ordersServiceUrl}/api/v1/payments/webhooks`,
    },
  ];
}
