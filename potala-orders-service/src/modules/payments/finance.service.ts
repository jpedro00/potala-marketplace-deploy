import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { allocateCents, quoteSplit } from './financial-split';

export interface FinancialLine { productId: string; categoryId?: string; lineTotalCents: number }
export interface FinancialGroup { sellerId: string; subtotalCents: number; items: FinancialLine[] }

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  listPolicies() { return this.prisma.financialPolicy.findMany({orderBy: [{createdAt: 'desc'}, {id: 'desc'}]}); }

  async createPolicy(actor: string, input: {scope: string; scopeId?: string; commissionBps: number; gatewayFeeBps: number; fixedFeeCents: number}) {
    const scopeKey = `${input.scope}:${input.scopeId ?? '*'}`;
    if ((input.scope === 'PLATFORM') !== !input.scopeId) throw new BadRequestException('scopeId is required except for PLATFORM');
    try {
      return await this.prisma.$transaction(async tx => {
        const latest = await tx.financialPolicy.findFirst({where: {scopeKey}, orderBy: {version: 'desc'}});
        return tx.financialPolicy.create({data: {...input, scopeKey, version: (latest?.version ?? 0) + 1, createdByUserId: actor}});
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(e.code)) throw new ConflictException('Policy changed concurrently; reload and retry');
      throw e;
    }
  }

  async quote(groups: FinancialGroup[], discount: number) {
    const policies = await this.prisma.financialPolicy.findMany({orderBy: {version: 'desc'}});
    const discounts = allocateCents(discount, groups.map(g => g.subtotalCents));
    return groups.map((group, index) => {
      const lineDiscounts = allocateCents(discounts[index], group.items.map(i => i.lineTotalCents));
      const lines = group.items.map((line, i) => {
        const policy = [
          policies.find(p => p.scope === 'PRODUCT' && p.scopeId === line.productId),
          policies.find(p => p.scope === 'CATEGORY' && p.scopeId === line.categoryId),
          policies.find(p => p.scope === 'SELLER' && p.scopeId === group.sellerId),
          policies.find(p => p.scope === 'PLATFORM'),
        ].find(Boolean);
        if (!policy) throw new ConflictException('Commercial policy has not been approved for this purchase');
        return {productId: line.productId, ...quoteSplit(line.lineTotalCents, lineDiscounts[i], policy)};
      });
      return {sellerId: group.sellerId, discountCents: discounts[index], commissionCents: lines.reduce((s, l) => s + l.commissionCents, 0), gatewayFeeCents: lines.reduce((s, l) => s + l.gatewayFeeCents, 0), sellerNetCents: lines.reduce((s, l) => s + l.sellerNetCents, 0), financialSnapshot: {version: 1, fixedFeeBasis: 'PER_ORDER_LINE', lines}};
    });
  }

  async prepareRefund(actor: string, paymentId: string, amountCents: number, key: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        const existing = await tx.refundRequest.findUnique({where: {idempotencyKey: key}});
        if (existing) {
          if (existing.paymentTransactionId !== paymentId || existing.amountCents !== amountCents) throw new ConflictException('Idempotency key already used for another refund');
          return existing;
        }
        const payment = await tx.paymentTransaction.findUnique({where: {id: paymentId}});
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.status !== 'APPROVED') throw new ConflictException('Only approved payments can be refunded');
        const totals = await tx.refundRequest.aggregate({where: {paymentTransactionId: paymentId, status: {not: 'CANCELLED'}}, _sum: {amountCents: true}});
        if (amountCents > payment.amountCents - (totals._sum.amountCents ?? 0)) throw new ConflictException('Refund exceeds remaining payment balance');
        return tx.refundRequest.create({data: {paymentTransactionId: paymentId, amountCents, idempotencyKey: key, createdByUserId: actor}});
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(e.code)) throw new ConflictException('Refund changed concurrently; retry with the same key');
      throw e;
    }
  }
}
