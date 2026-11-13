/** Legacy checkout fixtures explicitly configure zero-rate seller delivery. */
export function sellerDeliveryMock() {
  return {
    getDeliverySettings: jest.fn(async (sellerId: string) => ({sellerId, pickupEnabled: false, pickupAddress: null, deliveryEnabled: true, revision: 1, rates: [{state: 'SP', priceCents: 0, estimatedDays: 3}]})),
    getPaymentSettings: jest.fn(async () => ({status: 'ACTIVE', acceptPix: true, acceptCard: true, recipientRef: null})),
  };
}
