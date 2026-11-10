import { BadRequestException } from '@nestjs/common';

const money = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647) throw new BadRequestException('Invalid amount in cents');
};

/** Largest remainder; input order breaks ties deterministically. BigInt avoids float drift. */
export function allocateCents(total: number, weights: number[]): number[] {
  money(total);
  weights.forEach(money);
  const sum = weights.reduce((s, n) => s + BigInt(n), 0n);
  if (sum === 0n) {
    if (total) throw new BadRequestException('Cannot allocate against zero');
    return weights.map(() => 0);
  }
  const rows = weights.map((n, i) => ({i, amount: Number(BigInt(total) * BigInt(n) / sum), remainder: BigInt(total) * BigInt(n) % sum}));
  let remaining = total - rows.reduce((s, r) => s + r.amount, 0);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) if (remaining-- > 0) row.amount++;
  return rows.map(r => r.amount);
}

export interface SplitPolicy { id: string; commissionBps: number; gatewayFeeBps: number; fixedFeeCents: number }
export function quoteSplit(grossCents: number, discountCents: number, policy: SplitPolicy) {
  money(grossCents); money(discountCents); money(policy.fixedFeeCents);
  for (const bps of [policy.commissionBps, policy.gatewayFeeBps]) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new BadRequestException('Invalid basis points');
  }
  const payableCents = grossCents - discountCents;
  money(payableCents);
  const rounded = (bps: number) => Number((BigInt(payableCents) * BigInt(bps) + 5000n) / 10000n);
  const commissionCents = rounded(policy.commissionBps);
  const gatewayFeeCents = rounded(policy.gatewayFeeBps) + policy.fixedFeeCents;
  const sellerNetCents = payableCents - commissionCents - gatewayFeeCents;
  money(sellerNetCents);
  return {version: 1, policyId: policy.id, grossCents, discountCents, payableCents, commissionBps: policy.commissionBps, gatewayFeeBps: policy.gatewayFeeBps, fixedFeeCents: policy.fixedFeeCents, commissionCents, gatewayFeeCents, sellerNetCents};
}
