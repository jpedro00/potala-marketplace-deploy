/** Provider seam. Real adapters must verify webhooks, honor persisted idempotency
 * keys across restarts, and apply every split. Never ignore or silently drop a split.
 * No credentials, PAN/CVV or raw bank details cross this boundary.
 */
export interface PaymentSplitRecipient {
  sellerId: string;
  amountCents: number;
  recipientRef?: string;
}
export interface PaymentChargeInput {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  /** Persisted key; adapters must use orderId as the stable fallback for legacy callers. */
  idempotencyKey?: string;
  paymentMethod?: 'PIX' | 'CARD';
  /** Marketplace commission plus provider fee: together with seller splits reconciles amountCents. */
  platformAmountCents?: number;
  splits?: PaymentSplitRecipient[];
}
export type PaymentChargeStatus = 'APPROVED' | 'PENDING' | 'FAILED';
export interface PaymentChargeResult {
  status: PaymentChargeStatus;
  provider: string;
  providerRef: string;
}
export interface PaymentWebhookEvent {
  provider: string;
  providerRef: string;
  status: Extract<PaymentChargeStatus, 'APPROVED' | 'FAILED'>;
}
export interface PaymentGatewayClient {
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
  /** Must authenticate the raw provider payload before returning a normalized event. */
  parseWebhook(provider: string, payload: unknown, headers: Record<string, string>): Promise<PaymentWebhookEvent>;
}
export const PAYMENT_GATEWAY_CLIENT = 'PAYMENT_GATEWAY_CLIENT';
