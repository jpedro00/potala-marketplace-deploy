import { quoteSeller, quoteApprovedCarrier } from './shipping';
const settings = {sellerId: 'store', pickupEnabled: false, pickupAddress: null, deliveryEnabled: false, revision: 3, rates: []};
describe('authoritative seller freight', () => {
  const address = {state: 'SP', postalCode: '01310-000'};
  it('never treats missing settings or unavailable provider as free freight', () => {
    expect(() => quoteSeller(settings, 'DELIVERY', address)).toThrow();
    expect(() => quoteSeller(settings, 'PICKUP', address)).toThrow();
    expect(() => quoteApprovedCarrier()).toThrow('unavailable');
  });
  it('requires explicit pickup address and snapshots revision', () => {
    expect(quoteSeller({...settings, pickupEnabled: true, pickupAddress: 'Rua A 123'}, 'PICKUP', address)).toMatchObject({priceCents: 0, revision: 3, basis: 'EXPLICIT_PICKUP', pickupAddress: 'Rua A 123'});
  });
  it('selects narrow CEP rate before state rate; zero is explicitly configured', () => {
    const rates = [{state: 'SP', priceCents: 2000, estimatedDays: 5}, {state: 'SP', postalCodeFrom: '01000000', postalCodeTo: '02000000', priceCents: 0, estimatedDays: 2}];
    expect(quoteSeller({...settings, deliveryEnabled: true, rates}, 'DELIVERY', address)).toMatchObject({priceCents: 0, basis: 'EXPLICIT_FREE_RATE'});
    expect(quoteSeller({...settings, deliveryEnabled: true, rates}, 'DELIVERY', {...address, postalCode: '03000-000'}).priceCents).toBe(2000);
    expect(() => quoteSeller({...settings, deliveryEnabled: true, rates}, 'DELIVERY', {...address, state: 'RJ'})).toThrow();
  });
  it.each([{state: 'XX', postalCode: '12345678'}, {state: 'SP', postalCode: '1'}, {state: 'SP', postalCode: '12345--678'}])('rejects invalid destination %j', address => expect(() => quoteSeller({...settings, pickupEnabled: true, pickupAddress: 'Rua A'}, 'PICKUP', address)).toThrow());
});
