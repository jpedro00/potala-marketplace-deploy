import { Module } from '@nestjs/common';
import { MockPaymentGatewayAdapter } from './mock-payment-gateway.adapter';
import { PAYMENT_GATEWAY_CLIENT } from './payment-gateway.interface';
import { ServiceUnavailableException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

export function createPaymentGateway(environment = process.env.NODE_ENV, mode = process.env.PAYMENT_GATEWAY_MODE) {
  if (environment === 'test' && mode === 'mock') return new MockPaymentGatewayAdapter();
  return {
    async charge(): Promise<never> { throw new ServiceUnavailableException('Payment provider has not been configured. No charge or payout was performed.'); },
    async parseWebhook(): Promise<never> { throw new ServiceUnavailableException('Payment provider has not been configured.'); },
  };
}

/**
 * Production fails closed until a real adapter is selected and implemented.
 * Simulation requires NODE_ENV=test AND PAYMENT_GATEWAY_MODE=mock.
 * Real adapters must honor persisted idempotency keys and authenticated webhooks.
 */
@Module({
  controllers: [FinanceController],
  providers: [
    FinanceService,
    { provide: PAYMENT_GATEWAY_CLIENT, useFactory: () => createPaymentGateway() },
  ],
  exports: [PAYMENT_GATEWAY_CLIENT, FinanceService],
})
export class PaymentsModule {}
