import { LegalService } from './legal.service';
describe('LegalService',()=>{
  it('does not accept an unpublished policy',async()=>{
    const tx:any={ $queryRaw:jest.fn(),legalPolicy:{findUnique:async()=>({status:'DRAFT'})}};
    const db:any={$transaction:(fn:any)=>fn(tx)};
    await expect(new LegalService(db).accept('policy','user')).rejects.toThrow('Current published policy required');
  });
  it('returns pending configuration without inventing legal text',async()=>{
    const db:any={legalPolicy:{findFirst:async()=>null}};
    expect(await new LegalService(db).current('TERMS')).toEqual({configured:false,key:'TERMS'});
  });
});
