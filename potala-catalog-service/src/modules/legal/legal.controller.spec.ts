import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
describe('LegalController authenticated acceptance',()=>{
  it('uses the session identity even if an attacker supplies another user id',async()=>{
    const accept=jest.fn().mockResolvedValue({id:'proof'});
    const controller=new LegalController({accept} as unknown as LegalService);
    await controller.accept({policyId:'policy',userId:'victim'} as any,{id:'session-user'} as AuthenticatedUser);
    expect(accept).toHaveBeenCalledWith('policy','session-user');
  });
});
