import { DeliverySettingsService } from './delivery-settings.controller';
describe('seller delivery owner settings', () => {
  const input = {pickupEnabled: true, pickupAddress: 'Rua A 123', deliveryEnabled: true, rates: [{state: 'SP', priceCents: 500, estimatedDays: 2}]};
  const owner = {sellerId: 'store', membershipRole: 'OWNER'};
  it.each(['STAFF', 'MANAGER'])('rejects %s before touching settings', async membershipRole => {
    await expect(new DeliverySettingsService({} as never).save({...owner, membershipRole} as never, input)).rejects.toThrow('owner');
  });
  it('rejects missing address, missing explicit rates, invalid and duplicate CEP ranges', async () => {
    const service = new DeliverySettingsService({} as never);
    await expect(service.save(owner as never, {...input, pickupAddress: ' '})).rejects.toThrow('address');
    await expect(service.save(owner as never, {...input, rates: []})).rejects.toThrow('explicit rate');
    await expect(service.save(owner as never, {...input, rates: [{...input.rates[0], postalCodeFrom: '20000000', postalCodeTo: '10000000'}]})).rejects.toThrow('range');
    await expect(service.save(owner as never, {...input, rates: [input.rates[0], input.rates[0]]})).rejects.toThrow('Duplicate');
  });
  it('persists explicit free regional rate and increments revision', async () => {
    const upsert = jest.fn().mockResolvedValue({revision: 2});
    const service = new DeliverySettingsService({sellerDeliverySettings: {upsert}} as never);
    await service.save(owner as never, {...input, rates: [{...input.rates[0], priceCents: 0}]});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({where: {sellerId: 'store'}, update: expect.objectContaining({revision: {increment: 1}, rates: [{state: 'SP', priceCents: 0, estimatedDays: 2}]})}));
  });
});
