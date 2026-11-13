import { FiscalAttachmentsService, validateFiscalFile } from './fiscal-attachments.controller';
describe('private fiscal attachments', () => {
  const file = (text: string, mediaType = 'application/xml', fileName = 'nota.xml') => ({base64: Buffer.from(text).toString('base64'), mediaType, fileName});
  it('accepts PDF magic and plain fiscal XML', () => {
    expect(validateFiscalFile(file('%PDF-1.7\n%%EOF', 'application/pdf', 'nota.pdf')).length).toBeGreaterThan(0);
    expect(validateFiscalFile(file('<?xml version="1.0"?><nfeProc><NFe>123</NFe></nfeProc>')).length).toBeGreaterThan(0);
  });
  it.each(['<!DOCTYPE nfe [<!ENTITY x SYSTEM "file:///etc/passwd">]><nfe>&x;</nfe>', '<!ENTITY x SYSTEM "http://evil"><nfe>x</nfe>', '<?xml-stylesheet href="https://evil"?><nfe>x</nfe>', '<html>bad', 'notxml'])('rejects XML external resolution/malformed %s', text => expect(() => validateFiscalFile(file(text))).toThrow());
  it('rejects wrong magic, base64, and oversized bytes', () => {
    expect(() => validateFiscalFile(file('evil', 'application/pdf', 'nota.pdf'))).toThrow();
    expect(() => validateFiscalFile({...file('<n>x</n>'), base64: 'https://evil'})).toThrow();
    expect(() => validateFiscalFile(file('x'.repeat(5 * 1024 * 1024 + 1)))).toThrow();
  });
  it.each(['<a x="1" x="2"/>', '<?xml nonsense?><a/>', '<a>&#0;</a>', '<a><b></a>', '<a/> <b/>'])('rejects XML syntax violations %s', text => expect(() => validateFiscalFile(file(text))).toThrow());
  it('translates concurrent serializable uploads to a reviewable 409', async () => {
    const {Prisma} = await import('@prisma/client');
    const prisma = {sellerOrder: {findFirst: jest.fn().mockResolvedValue({order: {customerId: 'customer'}})}, $transaction: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('race', {code: 'P2034', clientVersion: '6'}))};
    const service = new FiscalAttachmentsService(prisma as never);
    await expect(service.upload('order', 'seller', 'actor', file('<n/>'))).rejects.toMatchObject({status: 409});
  });
  it('scopes IDOR before reading bytes, writing audit, revoking or uploading', async () => {
    const prisma = {sellerOrder: {findFirst: jest.fn().mockResolvedValue(null)}, fiscalAttachment: {findFirst: jest.fn()}, $transaction: jest.fn()};
    const service = new FiscalAttachmentsService(prisma as never);
    await expect(service.download('order', 'file', {customerId: 'foreign'}, 'foreign')).rejects.toThrow('not found');
    expect(prisma.sellerOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({where: {id: 'order', order: {customerId: 'foreign'}}}));
    await expect(service.revoke('order', 'file', {sellerId: 'foreign'}, 'foreign')).rejects.toThrow();
    await expect(service.upload('order', 'foreign', 'foreign', file('<n>x</n>'))).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
