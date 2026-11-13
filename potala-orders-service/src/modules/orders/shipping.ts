import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export const STATES = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
export interface DeliverySettings {sellerId: string; pickupEnabled: boolean; pickupAddress: string | null; deliveryEnabled: boolean; revision: number; rates: unknown}
export interface DeliveryChoice {sellerId: string; method: 'PICKUP' | 'DELIVERY' | 'CARRIER'}
export interface ShippingQuote {sellerId: string; method: string; priceCents: number; estimatedDays: number; revision: number; pickupAddress?: string; basis: string}

/** Carrier integration boundary. Only an approved provider implementation may replace this.
 * Missing commercial/provider approval never falls back to a zero freight quote. */
export function quoteApprovedCarrier(): never { throw new ServiceUnavailableException('Principal carrier is unavailable: approved provider integration is not configured'); }

export function quoteSeller(settings: DeliverySettings, method: DeliveryChoice['method'], address: {state: string; postalCode: string}): ShippingQuote {
  if (!STATES.test(address.state) || !/^\d{5}-?\d{3}$/.test(address.postalCode)) throw new BadRequestException('Invalid Brazilian delivery state or postal code');
  const base = {sellerId: settings.sellerId, method, revision: settings.revision};
  if (method === 'CARRIER') return quoteApprovedCarrier();
  if (method === 'PICKUP') {
    if (!settings.pickupEnabled || !settings.pickupAddress) throw new BadRequestException('Pickup is not configured by this store');
    return {...base, priceCents: 0, estimatedDays: 0, pickupAddress: settings.pickupAddress, basis: 'EXPLICIT_PICKUP'};
  }
  if (method !== 'DELIVERY' || !settings.deliveryEnabled || !Array.isArray(settings.rates)) throw new BadRequestException('Delivery is not configured by this store');
  const postalCode = address.postalCode.replace('-', '');
  const rates = settings.rates.filter((rate: any) => rate.state === address.state && (!rate.postalCodeFrom || (postalCode >= rate.postalCodeFrom && postalCode <= rate.postalCodeTo)));
  // Explicitly prefer the narrowest postal range; reject ambiguous equal ranges at configuration time.
  rates.sort((a: any, b: any) => (a.postalCodeFrom ? Number(a.postalCodeTo) - Number(a.postalCodeFrom) : 100000000) - (b.postalCodeFrom ? Number(b.postalCodeTo) - Number(b.postalCodeFrom) : 100000000));
  const rate = rates[0] as any;
  if (!rate || !Number.isSafeInteger(rate.priceCents) || rate.priceCents < 0 || rate.priceCents > 2147483647 || !Number.isInteger(rate.estimatedDays) || rate.estimatedDays < 0 || rate.estimatedDays > 365) throw new BadRequestException('This store does not deliver to the destination');
  return {...base, priceCents: rate.priceCents, estimatedDays: rate.estimatedDays, basis: rate.priceCents === 0 ? 'EXPLICIT_FREE_RATE' : 'SELLER_REGIONAL_RATE'};
}
