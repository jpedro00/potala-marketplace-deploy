import { validate } from 'class-validator';
import { SellersService } from './sellers.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

describe('Owner payment preferences', () => {
  const context = {sellerId: 'own-store', userId: 'owner', membershipRole: 'OWNER'};
  it.each(['MANAGER', 'STAFF'])('rejects %s before accessing payment or legal settings', async membershipRole => {
    const service = new SellersService({} as never);
    await expect(service.getPaymentSettings({...context, membershipRole} as never)).rejects.toThrow('owner');
    await expect(service.updatePaymentSettings({...context, membershipRole} as never, {acceptPix: true})).rejects.toThrow('owner');
    await expect(service.updateSelf({...context, membershipRole} as never, {tradeName: 'Changed'})).rejects.toThrow('owner');
  });
  it('returns masked metadata and status without exposing provider reference or credentials', async () => {
    const findUnique = jest.fn().mockResolvedValue({recipientRef: 'private-reference', provider: 'provider', acceptPix: true, accountLast4: '1234'});
    const service = new SellersService({sellerPaymentSettings: {findUnique}} as never);
    const result = await service.getPaymentSettings(context as never);
    expect(findUnique).toHaveBeenCalledWith({where: {sellerId: 'own-store'}});
    expect(result).toMatchObject({recipientConfigured: true, accountLast4: '1234', gatewayStatus: 'UNAVAILABLE'});
    expect(JSON.stringify(result)).not.toContain('private-reference');
  });
  it('rejects bank/card data and nonboolean payment preferences at the DTO boundary', async () => {
    const dto = Object.assign(new UpdatePaymentSettingsDto(), {acceptPix: 'true', accountNumber: '12345', cvv: '123'});
    const errors = await validate(dto, {whitelist: true, forbidNonWhitelisted: true});
    expect(errors.map(e => e.property).sort()).toEqual(['acceptPix', 'accountNumber', 'cvv']);
  });
});
