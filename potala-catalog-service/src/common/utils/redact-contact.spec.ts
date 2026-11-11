import { redactSensitive } from './redact';
describe('Contact and meeting request log privacy',()=>{
  it('redacts personal content and private meeting URLs even in explicit debug logging',()=>{
    expect(redactSensitive({name:'Person',email:'private@example.test',subject:'Sensitive',message:'Private message',nested:{meetingUrl:'https://meet.example.test/private'},status:'READ'})).toEqual({name:'[REDACTED]',email:'[REDACTED]',subject:'[REDACTED]',message:'[REDACTED]',nested:{meetingUrl:'[REDACTED]'},status:'READ'});
  });
});
