import { validateDocument } from './documents.service';
describe('private partner uploads',()=>{
  it('rejects a renamed executable',()=>expect(()=>validateDocument('application/pdf',Buffer.from('MZ-executable').toString('base64'))).toThrow());
  it('rejects oversized uploads',()=>expect(()=>validateDocument('application/pdf',Buffer.alloc(5*1024*1024+1).toString('base64'))).toThrow());
  it('accepts PDF signature',()=>expect(validateDocument('application/pdf',Buffer.from('%PDF-1.7\nbody').toString('base64')).toString()).toContain('%PDF-'));
});
