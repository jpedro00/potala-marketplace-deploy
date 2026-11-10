import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { FinanceService } from '../payments/finance.service';
import { SellersServiceClient } from '../../clients/sellers-service.client';
import type { ActivityPaymentDto } from './activity-payments.controller';
import {
  OrderStatus,
  OrderStatusHistoryActorType,
  OrderStatusHistorySource,
  Prisma,
  SellerOrderStatus,
  PaymentTransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CatalogServiceClient, InventoryItemInput } from '../../clients/catalog-service.client';
import {
  PAYMENT_GATEWAY_CLIENT,
  PaymentChargeResult,
  PaymentGatewayClient,
  PaymentSplitRecipient,
  PaymentWebhookEvent,
} from '../payments/payment-gateway.interface';
import { ProductStatus, ResolvedProductVariant } from '../../common/types/catalog-types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildPage,
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
} from '../../common/pagination/pagination';
import {
  INT4_MAX,
  MAX_ORDER_NUMBER_RETRIES,
} from '../../common/constants/orders.constants';
import { CreateCheckoutDto, ShippingAddressDto } from './dto/create-checkout.dto';
import { CouponsService } from './coupons.service';
import {
  CheckoutIdempotencyHandle,
  CheckoutIdempotencyService,
} from './checkout-idempotency.service';
import {
  ORDER_TRANSITION_REASON,
  OrderTransitionContext,
  OrderTransitionsService,
} from './order-transitions.service';

type ValidatedItem = {
  categoryId?: string;
  productId: string;
  variantId: string;
  quantity: number;
  sellerId: string;
  productTitle: string;
  sku: string;
  unitPriceCents: number;
  lineTotalCents: number;
};

type SellerGroup = {
  financial?: Awaited<ReturnType<FinanceService['quote']>>[number];
  sellerId: string;
  items: ValidatedItem[];
  subtotalCents: number;
};

/**
 * F2.2A -- resultado de uma finalização de pagamento (aprovado/recusado):
 * - APPLIED: esta chamada mudou PaymentTransaction, Order e SellerOrders;
 * - ALREADY_FINALIZED: a PaymentTransaction já não estava PENDING
 *   (webhook repetido/concorrente) -- nada muda, nenhum efeito externo;
 * - ORDER_STATE_MISMATCH: a transação de pagamento foi registrada (fato do
 *   provedor, com provider/providerRef), mas o pedido já não estava
 *   PENDING_PAYMENT ou nem todos os subpedidos estavam PENDING -- pedido e
 *   subpedidos NÃO são alterados e nenhum efeito de estoque é disparado
 *   (fica para a reconciliação, F2.2C).
 */
type PaymentFinalizationOutcome =
  'APPLIED' | 'ALREADY_FINALIZED' | 'ORDER_STATE_MISMATCH';

/** Mesmo shape devolvido pelas transições de fulfillment do vendedor desde a v1. */
const SELLER_ORDER_WITH_ORDER_SUMMARY = {
  items: true,
  order: {
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      shippingAddress: true,
    },
  },
} satisfies Prisma.SellerOrderInclude;

/**
 * The only genuinely new business logic in this migration (see README.md):
 * the monolith's own OrdersService was a foundation-stage skeleton
 * (`listByCustomer` only, no controller, checkout explicitly documented as
 * "not implemented in this foundation stage"). This class implements the
 * checkout flow the monolith's own schema comments already specified:
 * resolve/validate against catalog-service, create the Order locally in a
 * SHORT transaction, reserve stock over the network (never inside that
 * transaction — see the Inventory model comment this project has carried
 * since catalog-service), then charge and commit/release.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogServiceClient: CatalogServiceClient,
    @Inject(PAYMENT_GATEWAY_CLIENT)
    private readonly paymentGateway: PaymentGatewayClient,
    private readonly couponsService: CouponsService,
    private readonly checkoutIdempotency: CheckoutIdempotencyService,
    // F2.2A -- sem estado; o default mantém compatíveis os testes que
    // constroem OrdersService à mão (Nest injeta o provider registrado).
    private readonly transitions: OrderTransitionsService = new OrderTransitionsService(),
    private readonly finance: FinanceService = new FinanceService(prisma),
    private readonly sellersServiceClient: SellersServiceClient = undefined!,
  ) {}

  async listForCustomer(customerId: string, query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    // Scoped in SQL, not by comparing customerId after a global read: a
    // cursor from another customer must be looked up as if it did not exist.
    await requireCursor(cursor, async (id) => {
      const order = await this.prisma.order.findFirst({
        where: { id, customerId },
        select: { id: true },
      });
      return order !== null;
    });

    const rows = await this.prisma.order.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where: { customerId },
      // Mesmo include de getForCustomer abaixo -- a listagem precisa do
      // mesmo shape que o detalhe, ou o frontend (que usa um unico tipo
      // OrderResponse pros dois) quebra ao tentar ler um campo que so o
      // detalhe trazia (bug real encontrado nesta sessao: sellerOrders[].
      // items vinha undefined aqui, derrubando a tela "Meus Pedidos").
      include: {
        shippingAddress: true,
        sellerOrders: { include: { items: true } },
        paymentTransactions: true,
      },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /**
   * Tenant-scoped in SQL on purpose. An order belonging to another customer
   * must be indistinguishable from an order that does not exist, otherwise
   * the 403 itself confirms the id to a foreign tenant — same reasoning as
   * ProductsService.getForSeller in catalog-service.
   */
  async getForCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        shippingAddress: true,
        // items.review e items.returnRequest incluídos aqui (não em
        // listForCustomer, mesma assimetria já documentada acima entre
        // list/get) -- o frontend usa isso pra saber se já existe
        // avaliação/devolução de um item antes de mostrar os formulários
        // em "Meus Pedidos", sem precisar de uma chamada separada.
        sellerOrders: {
          include: { items: { include: { review: true, returnRequest: true } } },
        },
        paymentTransactions: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Read-only seller view of orders (see status doc): the authenticated
   * store's own SellerOrder rows, newest first. Scoped to SellerOrder, not
   * Order — a seller only ever sees the slice of a (possibly multi-seller)
   * order that belongs to their own store, never another seller's items or
   * totals on the same order. Same tenant-scoped-cursor reasoning as
   * listForCustomer above.
   */
  async listForSeller(sellerId: string, query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    await requireCursor(cursor, async (id) => {
      const sellerOrder = await this.prisma.sellerOrder.findFirst({
        where: { id, sellerId },
        select: { id: true },
      });
      return sellerOrder !== null;
    });

    const rows = await this.prisma.sellerOrder.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where: { sellerId },
      include: {
        items: true,
        order: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true,
            shippingAddress: true,
          },
        },
      },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /**
   * Tenant-scoped in SQL on purpose, same indistinguishable-404 reasoning as
   * getForCustomer above: a SellerOrder belonging to another store must 404,
   * not 403.
   */
  async getForSeller(sellerId: string, sellerOrderId: string) {
    const sellerOrder = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId },
      include: {
        items: true,
        order: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true,
            shippingAddress: true,
          },
        },
      },
    });

    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }

    return sellerOrder;
  }

  /**
   * Shared tenant-scoped lookup for the four fulfillment transitions below.
   * 404, never 403, for a SellerOrder that belongs to another store --
   * same reasoning as getForSeller.
   */
  private async requireSellerOrderForStatusUpdate(
    sellerId: string,
    sellerOrderId: string,
  ) {
    const sellerOrder = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId },
      select: { id: true, status: true, orderId: true },
    });
    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }
    return sellerOrder;
  }

  /**
   * F2.2A -- um passo de fulfillment do vendedor: pré-checagem (404 de
   * outra loja, 409 com a mensagem de sempre) e, numa transação curta sem
   * chamada externa, o UPDATE condicional ao status esperado + o histórico.
   * Se o status mudou entre a leitura e o UPDATE (dois cliques/abas), o
   * UPDATE não acerta a linha e a resposta é o mesmo 409 -- sem evento.
   */
  private async advanceSellerOrder(
    sellerId: string,
    sellerOrderId: string,
    from: SellerOrderStatus,
    to: SellerOrderStatus,
    conflictMessage: string,
    actorUserId: string | null,
  ) {
    const existing = await this.requireSellerOrderForStatusUpdate(
      sellerId,
      sellerOrderId,
    );
    if (existing.status !== from) {
      throw new ConflictException(conflictMessage);
    }
    return this.prisma.$transaction(async (tx) => {
      const moved = await this.transitions.transitionSellerOrder(
        tx,
        { sellerOrderId, orderId: existing.orderId, sellerId },
        from,
        to,
        {
          source: OrderStatusHistorySource.SELLER,
          actorType: OrderStatusHistoryActorType.SELLER,
          actorId: actorUserId,
        },
      );
      if (!moved) {
        throw new ConflictException(conflictMessage);
      }
      const updated = await tx.sellerOrder.findFirst({
        where: { id: sellerOrderId, sellerId },
        include: SELLER_ORDER_WITH_ORDER_SUMMARY,
      });
      if (!updated) {
        throw new NotFoundException('Seller order not found');
      }
      return updated;
    });
  }

  /**
   * Fulfillment lifecycle for the seller's own SellerOrder, one explicit
   * step at a time (never an arbitrary target status) -- same reasoning
   * already used by every other state machine in this project
   * (Coupon/Return/Content). Seller-driven only: CANCELLED is never
   * reachable from here (checkout/refund path only, out of scope).
   *
   * PENDING -> CONFIRMED is deliberately NOT part of this seller-driven
   * lifecycle (bug found in production regression, 02/10): that
   * transition belongs exclusively to the payment-approval flow
   * (finalizeApprovedPayment below, via sellerOrder.updateMany scoped by
   * orderId, inside the same $transaction that marks the Order PAID).
   * Every sibling SellerOrder of a paid Order is already CONFIRMED by the
   * time payment succeeds, so a SellerOrder can never legitimately still
   * be PENDING while its own Order is PAID -- there is no valid
   * Order.status to gate on here, checking Order.status === PAID would
   * just add a dead branch that can never be true for a real PENDING row.
   * The only correct rule is unconditional: a seller can never confirm
   * PENDING -> CONFIRMED manually, full stop. Ownership/ownership-404
   * stays identical to every other transition below.
   */
  async confirmForSeller(
    sellerId: string,
    sellerOrderId: string,
  ): Promise<never> {
    await this.requireSellerOrderForStatusUpdate(sellerId, sellerOrderId);
    throw new ConflictException(
      'Seller orders are confirmed automatically once payment is approved; manual confirmation by the seller is not allowed',
    );
  }

  /**
   * CONFIRMED -> PREPARING. `actorUserId` = usuário da loja que executou
   * (vai só para o histórico; opcional para não quebrar chamadores).
   */
  async prepareForSeller(
    sellerId: string,
    sellerOrderId: string,
    actorUserId: string | null = null,
  ) {
    return this.advanceSellerOrder(
      sellerId,
      sellerOrderId,
      SellerOrderStatus.CONFIRMED,
      SellerOrderStatus.PREPARING,
      'Only CONFIRMED seller orders can start preparing',
      actorUserId,
    );
  }

  /** PREPARING -> SHIPPED. */
  async shipForSeller(
    sellerId: string,
    sellerOrderId: string,
    actorUserId: string | null = null,
  ) {
    return this.advanceSellerOrder(
      sellerId,
      sellerOrderId,
      SellerOrderStatus.PREPARING,
      SellerOrderStatus.SHIPPED,
      'Only PREPARING seller orders can be shipped',
      actorUserId,
    );
  }

  /** SHIPPED -> DELIVERED. Terminal nesta v1 (sem "desfazer"). */
  async deliverForSeller(
    sellerId: string,
    sellerOrderId: string,
    actorUserId: string | null = null,
  ) {
    return this.advanceSellerOrder(
      sellerId,
      sellerOrderId,
      SellerOrderStatus.SHIPPED,
      SellerOrderStatus.DELIVERED,
      'Only SHIPPED seller orders can be marked delivered',
      actorUserId,
    );
  }

  /**
   * Admin, marketplace-wide: every SellerOrder row, across every store, not
   * just one seller's own. Same shape as listForSeller above (SellerOrder é
   * a unidade financeira por vendedor, mesmo padrão de granularidade), só
   * sem o `where: { sellerId }` -- quem chama já passou por
   * `@Roles(Role.ADMIN)` no controller, não há escopo de tenant aqui por
   * design. `sellerId` vem em cada linha; o admin panel resolve nome de
   * loja separadamente via GET /admin/sellers (sellers-service) -- não há
   * FK cross-schema pra fazer esse join aqui.
   */
  async listForAdmin(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    await requireCursor(cursor, async (id) => {
      const sellerOrder = await this.prisma.sellerOrder.findFirst({
        where: { id },
        select: { id: true },
      });
      return sellerOrder !== null;
    });

    const rows = await this.prisma.sellerOrder.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      include: {
        items: true,
        order: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true,
            shippingAddress: true,
          },
        },
      },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /** Checkout sem Idempotency-Key -- comportamento anterior, inalterado. */
  async checkout(customerId: string, dto: CreateCheckoutDto) {
    return this.runCheckout(customerId, dto, null);
  }

  /**
   * F2.1 -- checkout com Idempotency-Key (ver CheckoutIdempotencyService e
   * docs/checkout-idempotency.md). A mesma chave, do mesmo cliente e com o
   * mesmo payload, nunca cria um segundo pedido: o retry recebe o pedido já
   * criado (`replayed: true`) ou o mesmo erro, sem nova reserva de estoque
   * nem nova cobrança.
   */
  async checkoutIdempotent(
    customerId: string,
    dto: CreateCheckoutDto,
    idempotencyKey: string,
  ): Promise<{
    order: Awaited<ReturnType<OrdersService['getForCustomer']>>;
    replayed: boolean;
  }> {
    const claim = await this.checkoutIdempotency.begin(
      customerId,
      idempotencyKey,
      dto,
    );
    if (claim.kind === 'replay') {
      await this.syncPaymentEffects(claim.orderId);
      return {
        order: await this.getForCustomer(customerId, claim.orderId),
        replayed: true,
      };
    }
    try {
      const order = await this.runCheckout(customerId, dto, claim.handle);
      await this.checkoutIdempotency.complete(claim.handle);
      return { order, replayed: false };
    } catch (error) {
      await this.checkoutIdempotency.fail(claim.handle, error);
      throw error;
    }
  }

  /**
   * Ponto de entrada do controller: header Idempotency-Key ausente ->
   * checkout anterior (compatibilidade com clientes que ainda não enviam a
   * chave); presente -> validado (400 se inválido) e idempotente.
   */
  async checkoutWithOptionalKey(
    customerId: string,
    dto: CreateCheckoutDto,
    rawIdempotencyKey: unknown,
  ): Promise<{
    order: Awaited<ReturnType<OrdersService['getForCustomer']>>;
    replayed: boolean;
  }> {
    const key = this.checkoutIdempotency.parseKey(rawIdempotencyKey);
    if (key === null) {
      return { order: await this.checkout(customerId, dto), replayed: false };
    }
    return this.checkoutIdempotent(customerId, dto, key);
  }

  private async runCheckout(
    customerId: string,
    dto: CreateCheckoutDto,
    idempotency: CheckoutIdempotencyHandle | null,
  ) {
    const validatedItems = await this.resolveAndValidateItems(dto.items);
    const sellerGroups = this.groupBySeller(validatedItems);
    const subtotalCents = this.sum(sellerGroups.map((group) => group.subtotalCents));
    // v1 ainda não calcula frete -- sempre 0. Ver README.md. Desconto (via
    // cupom) é resolvido logo abaixo, uma única vez, antes do loop de
    // retry de número de pedido -- mesma razão de subtotalCents ser
    // calculado aqui fora: a janela de validade de um cupom não muda entre
    // milissegundos de retry.
    const shippingCents = 0;
    let couponId: string | null = null;
    let discountCents = 0;
    if (dto.couponCode) {
      const resolved = await this.couponsService.resolveForCheckout(
        dto.couponCode,
        subtotalCents,
      );
      couponId = resolved.couponId;
      discountCents = resolved.discountCents;
    }
    const totalCents = this.sum([subtotalCents, shippingCents]) - discountCents;
    if (totalCents <= 0) throw new BadRequestException('A payable order must have a positive total');
    const financial = await this.finance.quote(sellerGroups, discountCents);
    sellerGroups.forEach((group, i) => { group.financial = financial[i]; });
    const paymentMethod = dto.paymentMethod ?? 'PIX';
    const recipientRefs = new Map<string, string>();
    if (this.sellersServiceClient) {
      for (const group of sellerGroups) {
        const settings = await this.sellersServiceClient.getPaymentSettings(group.sellerId);
        if (settings.status !== 'ACTIVE' || !(paymentMethod === 'PIX' ? settings.acceptPix : settings.acceptCard)) throw new ConflictException('Payment method is not accepted by a store in this order');
        if (settings.recipientRef) recipientRefs.set(group.sellerId, settings.recipientRef);
      }
    }

    const order = await this.createOrderWithRetry(
      customerId,
      dto.shippingAddress,
      { subtotalCents, shippingCents, discountCents, totalCents, analyticsSessionId: dto.analyticsConsent === true ? dto.analyticsSessionId : undefined },
      sellerGroups,
      couponId,
      idempotency,
    );
    if (idempotency) {
      // A transação acima vinculou o pedido à chave (attachOrder) e foi
      // confirmada: a partir daqui um retry nunca reexecuta este checkout.
      idempotency.orderId = order.id;
    }

    const inventoryItems: InventoryItemInput[] = validatedItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    // Reserve OUTSIDE the transaction that created the order above -- this
    // is a network call, and the project's standing rule (first written for
    // catalog-service's Inventory model, now also in this service's own
    // schema comments) is that a Postgres transaction must never stay open
    // while waiting on a network call to another service.
    try {
      await this.catalogServiceClient.reserveInventory(inventoryItems);
    } catch (error) {
      const cancelled = await this.cancelPendingOrder(order.id, {
        source: OrderStatusHistorySource.CHECKOUT,
        actorType: OrderStatusHistoryActorType.SYSTEM,
        reason: ORDER_TRANSITION_REASON.INVENTORY_RESERVATION_FAILED,
      });
      if (!cancelled) {
        this.logger.warn(
          `Order ${order.orderNumber} not cancelled after the inventory reservation failed: order/sub-orders were not all awaiting payment -- left unchanged; needs reconciliation.`,
        );
      }
      throw error;
    }

    const paymentTransaction = await this.prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        status: PaymentTransactionStatus.PENDING,
        amountCents: totalCents,
        idempotencyKey: `order:${order.id}:charge`,
      },
    });

    // Seller net splits plus platformAmountCents reconcile exactly to total.
    // A future real adapter must honor all recipients and their persisted key.
    const splits: PaymentSplitRecipient[] = sellerGroups.map((group) => ({
      sellerId: group.sellerId,
      amountCents: group.financial!.sellerNetCents,
      ...(recipientRefs.has(group.sellerId) ? {recipientRef: recipientRefs.get(group.sellerId)} : {}),
    }));

    let chargeResult: PaymentChargeResult;
    try {
      chargeResult = await this.paymentGateway.charge({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountCents: totalCents,
        idempotencyKey: `order:${order.id}:charge`,
        paymentMethod,
        platformAmountCents: financial.reduce((sum, q) => sum + q.commissionCents + q.gatewayFeeCents, 0),
        splits,
      });
    } catch (error) {
      this.logger.error(
        `Payment gateway threw for order ${order.orderNumber}: ${(error as Error).message}`,
      );
      await this.finalizeFailedPayment(
        order.id,
        paymentTransaction.id,
        inventoryItems,
        OrderStatusHistorySource.PAYMENT_CHECKOUT,
        ORDER_TRANSITION_REASON.PAYMENT_GATEWAY_UNAVAILABLE,
      );
      throw new ServiceUnavailableException(
        'Payment gateway is unavailable. Try again shortly.',
      );
    }

    if (chargeResult.status === 'APPROVED') {
      await this.finalizeApprovedPayment(
        order.id,
        paymentTransaction.id,
        chargeResult,
        inventoryItems,
        OrderStatusHistorySource.PAYMENT_CHECKOUT,
      );
    } else if (chargeResult.status === 'FAILED') {
      await this.finalizeFailedPayment(
        order.id,
        paymentTransaction.id,
        inventoryItems,
        OrderStatusHistorySource.PAYMENT_CHECKOUT,
        ORDER_TRANSITION_REASON.PAYMENT_DECLINED,
        chargeResult,
      );
    } else {
      await this.prisma.paymentTransaction.update({where: {id: paymentTransaction.id}, data: {provider: chargeResult.provider, providerRef: chargeResult.providerRef}});
      // PENDING -- gateway aceitou a cobranca mas ainda nao confirmou
      // (tipico de Pix/boleto). Nada a fazer aqui: Order ja nasce
      // PENDING_PAYMENT e PaymentTransaction ja nasce PENDING (ver criacao
      // acima), e o estoque fica reservado (nem commit nem release) ate a
      // confirmacao chegar via webhook -- ver confirmPaymentFromWebhook.
      this.logger.log(
        `Order ${order.orderNumber} awaiting async payment confirmation (provider=${chargeResult.provider}, providerRef=${chargeResult.providerRef}).`,
      );
    }

    return this.getForCustomer(customerId, order.id);
  }

  async payActivity(customerId: string, dto: ActivityPaymentDto) {
    const enrollment = await this.catalogServiceClient.getEnrollment(dto.enrollmentId);
    if (enrollment.userId !== customerId) throw new NotFoundException('Enrollment not found');
    const existing = await this.prisma.order.findUnique({where: {activityEnrollmentId: enrollment.id}});
    if (existing) {
      if (existing.customerId !== customerId) throw new NotFoundException('Enrollment not found');
      await this.syncPaymentEffects(existing.id);
      if (existing.status === 'PENDING_PAYMENT' && enrollment.status === 'PENDING_PAYMENT' && enrollment.expiresAt && new Date(enrollment.expiresAt).getTime() > Date.now()) return this.chargeActivityOrder(customerId, existing.id);
      return this.getForCustomer(customerId, existing.id);
    }
    if (enrollment.status !== 'PENDING_PAYMENT' || !enrollment.expiresAt || new Date(enrollment.expiresAt).getTime() <= Date.now()) throw new ConflictException('Enrollment is not awaiting payment or its reservation expired');
    if (!Number.isSafeInteger(enrollment.priceCents) || enrollment.priceCents <= 0 || enrollment.priceCents > INT4_MAX) throw new ConflictException('Invalid activity price');
    if (!enrollment.sellerId) throw new ConflictException('Activity payment requires a configured seller recipient');
    const method = dto.paymentMethod ?? 'PIX';
    const preferences = await this.sellersServiceClient.getPaymentSettings(enrollment.sellerId);
    if (preferences.status !== 'ACTIVE' || !(method === 'PIX' ? preferences.acceptPix : preferences.acceptCard)) throw new ConflictException('Payment method is not accepted by this store');
    const [quote] = await this.finance.quote([{sellerId: enrollment.sellerId, subtotalCents: enrollment.priceCents, items: [{productId: enrollment.activityId, lineTotalCents: enrollment.priceCents}]}], 0);
    let order;
    try {
      order = await this.prisma.$transaction(async tx => {
        const created = await tx.order.create({data: {customerId, orderNumber: this.generateOrderNumber(), activityEnrollmentId: enrollment.id, subtotalCents: enrollment.priceCents, totalCents: enrollment.priceCents, analyticsSessionId: dto.analyticsConsent === true ? dto.analyticsSessionId : undefined}});
        const sellerOrder = await tx.sellerOrder.create({data: {orderId: created.id, sellerId: enrollment.sellerId!, subtotalCents: enrollment.priceCents, commissionCents: quote.commissionCents, gatewayFeeCents: quote.gatewayFeeCents, sellerNetCents: quote.sellerNetCents, financialSnapshot: {...quote.financialSnapshot, paymentMethod: method}}});
        await tx.paymentTransaction.create({data: {orderId: created.id, amountCents: enrollment.priceCents, idempotencyKey: `activity:${enrollment.id}:charge`}});
        const context: OrderTransitionContext = {source: OrderStatusHistorySource.CHECKOUT, actorType: OrderStatusHistoryActorType.CUSTOMER, actorId: customerId};
        await this.transitions.recordOrderCreated(tx, created.id, OrderStatus.PENDING_PAYMENT, context);
        await this.transitions.recordSellerOrderCreated(tx, {orderId: created.id, sellerOrderId: sellerOrder.id, sellerId: enrollment.sellerId!}, SellerOrderStatus.PENDING, context);
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.order.findUnique({where: {activityEnrollmentId: enrollment.id}});
        if (winner?.customerId === customerId) return this.getForCustomer(customerId, winner.id);
      }
      throw e;
    }
    return this.chargeActivityOrder(customerId, order.id);
  }

  private async chargeActivityOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({where: {id: orderId}, include: {paymentTransactions: true, sellerOrders: true}});
    if (order.customerId !== customerId) throw new NotFoundException('Enrollment not found');
    const payment = order.paymentTransactions.find(p => p.status === 'PENDING');
    if (order.status !== 'PENDING_PAYMENT' || !payment || payment.providerRef) return this.getForCustomer(customerId, order.id);
    const sellerOrder = order.sellerOrders[0];
    if (!sellerOrder) throw new ConflictException('Activity financial snapshot is missing');
    const snapshot = sellerOrder.financialSnapshot as Prisma.JsonObject | null;
    const method = snapshot?.paymentMethod === 'CARD' ? 'CARD' : 'PIX';
    const preferences = await this.sellersServiceClient.getPaymentSettings(sellerOrder.sellerId);
    // Provider adapters MUST deduplicate this persisted key, including across process restarts.
    let result: PaymentChargeResult;
    try {
      result = await this.paymentGateway.charge({orderId: order.id, orderNumber: order.orderNumber, amountCents: payment.amountCents, paymentMethod: method, idempotencyKey: payment.idempotencyKey!, splits: [{sellerId: sellerOrder.sellerId, amountCents: sellerOrder.sellerNetCents, ...(preferences.recipientRef ? {recipientRef: preferences.recipientRef} : {})}], platformAmountCents: sellerOrder.commissionCents + sellerOrder.gatewayFeeCents});
    } catch {
      await this.finalizeFailedPayment(order.id, payment.id, [], OrderStatusHistorySource.PAYMENT_CHECKOUT, ORDER_TRANSITION_REASON.PAYMENT_GATEWAY_UNAVAILABLE);
      throw new ServiceUnavailableException('Payment provider is unavailable. No confirmed payment or payout.');
    }
    if (result.status === 'APPROVED') await this.finalizeApprovedPayment(order.id, payment.id, result, [], OrderStatusHistorySource.PAYMENT_CHECKOUT);
    else if (result.status === 'FAILED') await this.finalizeFailedPayment(order.id, payment.id, [], OrderStatusHistorySource.PAYMENT_CHECKOUT, ORDER_TRANSITION_REASON.PAYMENT_DECLINED, result);
    else await this.prisma.paymentTransaction.update({where: {id: payment.id}, data: {provider: result.provider, providerRef: result.providerRef}});
    return this.getForCustomer(customerId, order.id);
  }

  /** Server callbacks are idempotent. Propagate failures so a provider replay retries them. */
  private async syncPaymentEffects(orderId: string) {
    const order = await this.prisma.order.findUnique({where: {id: orderId}});
    if (!order || !['PAID', 'FULFILLING', 'COMPLETED'].includes(order.status)) return;
    if (order.activityEnrollmentId) {
      try { await this.catalogServiceClient.confirmEnrollment(order.activityEnrollmentId, {orderId, userId: order.customerId, amountCents: order.totalCents, status: 'CONFIRMED'}); }
      catch (error) {
        await this.prisma.outboxEvent.upsert({where: {id: order.id}, create: {id: order.id, eventType: 'PAYMENT_RECONCILIATION_REQUIRED', eventVersion: 1, aggregateType: 'ORDER', aggregateId: order.id, orderId: order.id, payload: {reason: 'ENROLLMENT_CONFIRMATION_FAILED', enrollmentId: order.activityEnrollmentId}}, update: {}});
        throw error;
      }
    }
    if (order.analyticsSessionId) {
      try { await this.catalogServiceClient.recordPurchase(orderId, order.analyticsSessionId, order.totalCents); }
      catch { this.logger.warn(`Purchase analytics delivery failed for order ${orderId}`); }
    }
  }

  /**
   * Contraparte assincrona do fluxo acima -- chamada por
   * PaymentWebhooksController quando o gateway real confirma (ou rejeita)
   * um pagamento que tinha ficado PENDING no checkout. Idempotente: um
   * webhook duplicado (reentrega, retry do provedor) em cima de uma
   * PaymentTransaction que ja saiu de PENDING e um webhook pra uma
   * providerRef desconhecida sao ambos no-op, nunca erro 500 -- provedores
   * de webhook tratam qualquer resposta != 2xx como "tentar de novo", e
   * nao ha nada a reconciliar reprocessando um evento ja aplicado.
   */
  async confirmPaymentFromWebhook(event: PaymentWebhookEvent): Promise<void> {
    const paymentTransaction = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerRef: {
          provider: event.provider,
          providerRef: event.providerRef,
        },
      },
    });

    if (!paymentTransaction) {
      this.logger.warn(
        `Webhook for unknown transaction (provider=${event.provider}, providerRef=${event.providerRef}) -- ignored.`,
      );
      return;
    }

    if (paymentTransaction.status !== PaymentTransactionStatus.PENDING) {
      if (paymentTransaction.status === PaymentTransactionStatus.APPROVED) await this.syncPaymentEffects(paymentTransaction.orderId);
      this.logger.log(
        `Webhook for transaction ${paymentTransaction.id} ignored -- already ${paymentTransaction.status} (duplicate delivery).`,
      );
      return;
    }

    const inventoryItems = await this.getInventoryItemsForOrder(paymentTransaction.orderId);
    const chargeResult: PaymentChargeResult = {
      status: event.status,
      provider: event.provider,
      providerRef: event.providerRef,
    };

    if (event.status === 'APPROVED') {
      await this.finalizeApprovedPayment(
        paymentTransaction.orderId,
        paymentTransaction.id,
        chargeResult,
        inventoryItems,
        OrderStatusHistorySource.PAYMENT_WEBHOOK,
      );
    } else {
      await this.finalizeFailedPayment(
        paymentTransaction.orderId,
        paymentTransaction.id,
        inventoryItems,
        OrderStatusHistorySource.PAYMENT_WEBHOOK,
        ORDER_TRANSITION_REASON.PAYMENT_DECLINED,
        chargeResult,
      );
    }
  }

  /** Reconstroi InventoryItemInput[] a partir do pedido ja gravado -- usado por confirmPaymentFromWebhook, que nao tem o carrinho original em mao (so o orderId veio do webhook). */
  private async getInventoryItemsForOrder(orderId: string): Promise<InventoryItemInput[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { sellerOrder: { orderId } },
      select: { variantId: true, quantity: true },
    });

    return items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));
  }

  /**
   * Resolves every requested variant against catalog-service in one batched
   * call and validates each cart line against the authoritative result.
   * Nothing about price, seller, product status or stock is ever trusted
   * from the request body itself -- see docs/internal-api-contract.md.
   */
  private async resolveAndValidateItems(
    items: CreateCheckoutDto['items'],
  ): Promise<ValidatedItem[]> {
    const variantIds = [...new Set(items.map((item) => item.variantId))];
    const resolved = await this.catalogServiceClient.resolveVariants(variantIds);
    const byVariantId = new Map<string, ResolvedProductVariant>(
      resolved.map((variant) => [variant.variantId, variant]),
    );

    return items.map((item) => {
      const variant = byVariantId.get(item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Variant ${item.variantId} does not exist`,
        );
      }
      if (variant.productId !== item.productId) {
        throw new BadRequestException(
          `Variant ${item.variantId} does not belong to product ${item.productId}`,
        );
      }
      if (variant.productStatus !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `Product ${variant.productId} is not available for purchase`,
        );
      }
      // Early, non-atomic check for a fast, clear error message. The
      // authoritative, atomic check is catalog-service's own
      // /internal/inventory/reserve, called after the order is created below
      // -- stock can still change between this check and that call, and
      // reserve is what actually protects against overselling.
      if (variant.availableQuantity < item.quantity) {
        throw new ConflictException(
          `Insufficient stock for variant ${item.variantId}`,
        );
      }

      return {
        productId: item.productId,
        categoryId: variant.categoryId,
        variantId: item.variantId,
        quantity: item.quantity,
        sellerId: variant.sellerId,
        productTitle: variant.productTitle,
        sku: variant.sku,
        unitPriceCents: variant.unitPriceCents,
        lineTotalCents: this.multiply(variant.unitPriceCents, item.quantity),
      };
    });
  }

  private groupBySeller(items: ValidatedItem[]): SellerGroup[] {
    const bySeller = new Map<string, ValidatedItem[]>();
    for (const item of items) {
      const existing = bySeller.get(item.sellerId);
      if (existing) {
        existing.push(item);
      } else {
        bySeller.set(item.sellerId, [item]);
      }
    }

    return [...bySeller.entries()].map(([sellerId, sellerItems]) => ({
      sellerId,
      items: sellerItems,
      subtotalCents: this.sum(sellerItems.map((item) => item.lineTotalCents)),
    }));
  }

  private async createOrderWithRetry(
    customerId: string,
    shippingAddress: ShippingAddressDto,
    totals: {
      subtotalCents: number;
      shippingCents: number;
      discountCents: number;
      totalCents: number;
      analyticsSessionId?: string;
    },
    sellerGroups: SellerGroup[],
    couponId: string | null,
    idempotency: CheckoutIdempotencyHandle | null = null,
  ) {
    for (let attempt = 0; attempt <= MAX_ORDER_NUMBER_RETRIES; attempt += 1) {
      const orderNumber = this.generateOrderNumber();
      try {
        return await this.prisma.$transaction((tx) =>
          this.insertOrder(
            tx,
            customerId,
            orderNumber,
            shippingAddress,
            totals,
            sellerGroups,
            couponId,
            idempotency,
          ),
        );
      } catch (error) {
        // Anything other than an order-number collision is a real failure —
        // rethrow immediately rather than burning retries on it. A
        // collision falls through to the next loop iteration (or, once the
        // loop itself is exhausted, to the fallback below) instead of being
        // rethrown here: rethrowing on the *last* attempt would leak the
        // raw Prisma error out of this method instead of the clear
        // ConflictException below.
        if (!this.isOrderNumberConflict(error)) {
          throw error;
        }
      }
    }

    throw new ConflictException('Could not allocate a unique order number');
  }

  private async insertOrder(
    tx: Prisma.TransactionClient,
    customerId: string,
    orderNumber: string,
    shippingAddress: ShippingAddressDto,
    totals: {
      subtotalCents: number;
      shippingCents: number;
      discountCents: number;
      totalCents: number;
      analyticsSessionId?: string;
    },
    sellerGroups: SellerGroup[],
    couponId: string | null,
    idempotency: CheckoutIdempotencyHandle | null = null,
  ) {
    // Dentro da mesma transação que cria o Order: se o número de pedido
    // colidir e esta tentativa for descartada, o rollback desfaz este
    // incremento junto -- nunca conta um uso de cupom pra um pedido que
    // não chegou a existir. Ver CouponsService.recordUsage.
    if (couponId) {
      await this.couponsService.recordUsage(tx, couponId, totals.discountCents);
    }

    const order = await tx.order.create({
      data: {
        customerId,
        orderNumber,
        status: OrderStatus.PENDING_PAYMENT,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        analyticsSessionId: totals.analyticsSessionId,
        shippingAddress: {
          create: {
            recipient: shippingAddress.recipient,
            street: shippingAddress.street,
            number: shippingAddress.number,
            complement: shippingAddress.complement,
            neighborhood: shippingAddress.neighborhood,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
          },
        },
      },
    });

    // F2.2A -- eventos de criação na MESMA transação: colisão de número de
    // pedido ou attachOrder (F2.1) desfazem pedido e histórico juntos.
    const creation: OrderTransitionContext = {
      source: OrderStatusHistorySource.CHECKOUT,
      actorType: OrderStatusHistoryActorType.CUSTOMER,
      actorId: customerId,
    };
    await this.transitions.recordOrderCreated(
      tx,
      order.id,
      OrderStatus.PENDING_PAYMENT,
      creation,
    );

    for (const group of sellerGroups) {
      const sellerOrder = await tx.sellerOrder.create({
        data: {
          orderId: order.id,
          sellerId: group.sellerId,
          status: SellerOrderStatus.PENDING,
          subtotalCents: group.subtotalCents,
          // v1 computes neither per-seller shipping nor commission. See README.md.
          shippingCents: 0,
          commissionCents: group.financial!.commissionCents,
          sellerNetCents: group.financial!.sellerNetCents,
          gatewayFeeCents: group.financial!.gatewayFeeCents,
          discountCents: group.financial!.discountCents,
          financialSnapshot: group.financial!.financialSnapshot,
        },
      });
      await this.transitions.recordSellerOrderCreated(
        tx,
        {
          sellerOrderId: sellerOrder.id,
          orderId: order.id,
          sellerId: group.sellerId,
        },
        SellerOrderStatus.PENDING,
        creation,
      );

      for (const item of group.items) {
        await tx.orderItem.create({
          data: {
            sellerOrderId: sellerOrder.id,
            productId: item.productId,
            variantId: item.variantId,
            productTitle: item.productTitle,
            sku: item.sku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
          },
        });
      }
    }

    // F2.1 -- vincula o pedido à chave de idempotência na MESMA transação:
    // se outra execução retomou a chave, attachOrder lança e tudo acima
    // (pedido, subpedidos, itens, uso de cupom) é desfeito.
    if (idempotency) {
      await this.checkoutIdempotency.attachOrder(tx, idempotency, order.id);
    }

    return order;
  }

  /**
   * F2.2A (D-A1) -- cancela um pedido que ainda está PENDING_PAYMENT e, na
   * mesma transação, os subpedidos que ainda estão PENDING (só eles: nunca
   * um subpedido confirmado, enviado ou entregue). Usado só nas falhas
   * internas do checkout/pagamento. Não chama catálogo nem gateway.
   * false = o pedido já não estava PENDING_PAYMENT ou nem todos os
   * subpedidos estavam PENDING (nada foi alterado: um pedido nunca é
   * cancelado deixando um subpedido confirmado/enviado para trás).
   */
  private async cancelPendingOrder(
    orderId: string,
    context: OrderTransitionContext,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await this.transitions.allSellerOrdersIn(
          tx,
          orderId,
          SellerOrderStatus.PENDING,
        ))
      ) {
        return false;
      }
      const cancelled = await this.transitions.transitionOrder(
        tx,
        orderId,
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.CANCELLED,
        context,
      );
      if (!cancelled) {
        return false;
      }
      await this.transitions.transitionAllSellerOrdersOfOrder(
        tx,
        orderId,
        SellerOrderStatus.PENDING,
        SellerOrderStatus.CANCELLED,
        context,
      );
      return true;
    });
  }

  /**
   * Pagamento aprovado (checkout síncrono ou webhook). F2.2A (D-A2): tudo
   * condicionado ao estado esperado, na mesma transação curta --
   * PaymentTransaction PENDING -> APPROVED, Order PENDING_PAYMENT -> PAID,
   * SellerOrders PENDING -> CONFIRMED, com histórico. Só depois do commit,
   * e só se ESTA chamada aplicou a aprovação, o estoque é baixado no
   * catálogo: webhook repetido/concorrente não baixa duas vezes, e uma
   * aprovação para pedido que não está mais aguardando pagamento nunca o
   * transforma em PAID (fica registrada na PaymentTransaction e no log).
   */
  private async finalizeApprovedPayment(
    orderId: string,
    paymentTransactionId: string,
    chargeResult: PaymentChargeResult,
    inventoryItems: InventoryItemInput[],
    source: OrderStatusHistorySource,
  ): Promise<PaymentFinalizationOutcome> {
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<PaymentFinalizationOutcome> => {
        const payment = await tx.paymentTransaction.updateMany({
          where: {
            id: paymentTransactionId,
            status: PaymentTransactionStatus.PENDING,
          },
          data: {
            status: PaymentTransactionStatus.APPROVED,
            provider: chargeResult.provider,
            providerRef: chargeResult.providerRef,
          },
        });
        if (payment.count !== 1) {
          return 'ALREADY_FINALIZED';
        }
        if (
          !(await this.transitions.allSellerOrdersIn(
            tx,
            orderId,
            SellerOrderStatus.PENDING,
          ))
        ) {
          return 'ORDER_STATE_MISMATCH';
        }
        const context: OrderTransitionContext = {
          source,
          actorType: OrderStatusHistoryActorType.SYSTEM,
          reason: ORDER_TRANSITION_REASON.PAYMENT_APPROVED,
        };
        const paid = await this.transitions.transitionOrder(
          tx,
          orderId,
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.PAID,
          context,
        );
        if (!paid) {
          return 'ORDER_STATE_MISMATCH';
        }
        await this.transitions.transitionAllSellerOrdersOfOrder(
          tx,
          orderId,
          SellerOrderStatus.PENDING,
          SellerOrderStatus.CONFIRMED,
          context,
        );
        return 'APPLIED';
      },
    );

    if (outcome === 'ALREADY_FINALIZED') {
      await this.syncPaymentEffects(orderId);
      this.logger.log(
        `Approval for payment transaction ${paymentTransactionId} ignored -- already finalized (duplicate delivery).`,
      );
      return outcome;
    }
    if (outcome === 'ORDER_STATE_MISMATCH') {
      // Depende da F2.2C (reconciliação): pagamento aprovado registrado para
      // um pedido que já não aguardava pagamento (ou com subpedido fora de
      // PENDING). Nada é alterado no pedido nem nos subpedidos e nenhum
      // estoque é baixado; detectável por SQL (transação APPROVED com
      // pedido diferente de PAID).
      this.logger.error(
        `Approved payment transaction ${paymentTransactionId} for order ${orderId}, whose order/sub-orders are not all awaiting payment -- left unchanged, stock not committed; needs reconciliation.`,
      );
      return outcome;
    }

    try {
      if (inventoryItems.length) await this.catalogServiceClient.commitInventory(inventoryItems);
    } catch (error) {
      // Known gap, documented in README.md: payment already succeeded and
      // the order is already PAID in this service's own database. A
      // failure here leaves stock reserved-but-not-committed in
      // catalog-service until someone reconciles it by hand -- there is no
      // background retry/reconciliation job in this v1.
      this.logger.error(
        `commitInventory failed for order ${orderId} after an approved payment: ${(error as Error).message}`,
      );
    }
    await this.syncPaymentEffects(orderId);
    return outcome;
  }

  /**
   * Pagamento recusado (ou gateway indisponível no checkout). Mesmas
   * garantias de finalizeApprovedPayment: PaymentTransaction PENDING ->
   * FAILED, Order PENDING_PAYMENT -> CANCELLED e SellerOrders PENDING ->
   * CANCELLED (D-A1), com histórico; o estoque só é liberado se ESTA
   * chamada aplicou a recusa (nunca duas vezes).
   */
  private async finalizeFailedPayment(
    orderId: string,
    paymentTransactionId: string,
    inventoryItems: InventoryItemInput[],
    source: OrderStatusHistorySource,
    reason: string,
    chargeResult?: PaymentChargeResult,
  ): Promise<PaymentFinalizationOutcome> {
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<PaymentFinalizationOutcome> => {
        const payment = await tx.paymentTransaction.updateMany({
          where: {
            id: paymentTransactionId,
            status: PaymentTransactionStatus.PENDING,
          },
          data: {
            status: PaymentTransactionStatus.FAILED,
            provider: chargeResult?.provider,
            providerRef: chargeResult?.providerRef,
          },
        });
        if (payment.count !== 1) {
          return 'ALREADY_FINALIZED';
        }
        if (
          !(await this.transitions.allSellerOrdersIn(
            tx,
            orderId,
            SellerOrderStatus.PENDING,
          ))
        ) {
          return 'ORDER_STATE_MISMATCH';
        }
        const context: OrderTransitionContext = {
          source,
          actorType: OrderStatusHistoryActorType.SYSTEM,
          reason,
        };
        const cancelled = await this.transitions.transitionOrder(
          tx,
          orderId,
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.CANCELLED,
          context,
        );
        if (!cancelled) {
          return 'ORDER_STATE_MISMATCH';
        }
        await this.transitions.transitionAllSellerOrdersOfOrder(
          tx,
          orderId,
          SellerOrderStatus.PENDING,
          SellerOrderStatus.CANCELLED,
          context,
        );
        return 'APPLIED';
      },
    );

    if (outcome === 'ALREADY_FINALIZED') {
      this.logger.log(
        `Failure for payment transaction ${paymentTransactionId} ignored -- already finalized (duplicate delivery).`,
      );
      return outcome;
    }
    if (outcome === 'ORDER_STATE_MISMATCH') {
      this.logger.error(
        `Failed payment transaction ${paymentTransactionId} for order ${orderId}, whose order/sub-orders are not all awaiting payment -- left unchanged, stock not released; needs reconciliation.`,
      );
      return outcome;
    }

    try {
      if (inventoryItems.length) await this.catalogServiceClient.releaseInventory(inventoryItems);
    } catch (error) {
      // Same known gap as finalizeApprovedPayment's commitInventory, mirrored
      // for the release path: stock could stay reserved-but-not-released.
      this.logger.error(
        `releaseInventory failed for order ${orderId} after a failed payment: ${(error as Error).message}`,
      );
    }
    return outcome;
  }

  private generateOrderNumber(): string {
    const timestampPart = Date.now().toString(36).toUpperCase();
    const randomPart = randomBytes(3).toString('hex').toUpperCase();
    return `PED-${timestampPart}-${randomPart}`;
  }

  private isOrderNumberConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const rawTarget = error.meta?.target;
    const target = (
      Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? '')
    ).toLowerCase();
    return target.includes('numero_pedido') || target.includes('ordernumber');
  }

  /**
   * Order/SellerOrder/OrderItem money columns are Prisma Int (int4, max
   * 2,147,483,647) -- the same warning catalog-service's own
   * MAX_STOCK_QUANTITY comment left for this service. unitPriceCents can be
   * up to 100,000,000 (catalog-service's MAX_PRICE_CENTS) and quantity up to
   * MAX_ITEM_QUANTITY (1,000): their product alone can exceed int4, so this
   * is checked explicitly rather than trusted to "just fit".
   */
  private multiply(unitPriceCents: number, quantity: number): number {
    const total = unitPriceCents * quantity;
    this.assertFitsInt4(total, 'Order line total');
    return total;
  }

  private sum(values: number[]): number {
    const total = values.reduce((accumulator, value) => accumulator + value, 0);
    this.assertFitsInt4(total, 'Order total');
    return total;
  }

  private assertFitsInt4(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value > INT4_MAX) {
      throw new BadRequestException(
        `${label} exceeds the maximum supported amount`,
      );
    }
  }
}
