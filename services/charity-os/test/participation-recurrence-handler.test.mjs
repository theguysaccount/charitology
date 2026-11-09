/** Actual main Request/error/header path; business tx callbacks are deliberately
 * not executed. No current authentication, PostgreSQL or provider proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../lib/handler.mjs';import {csrf,HttpError} from '../lib/security.mjs';
const settings={origin:'https://os.invalid',secret:'fictional-test-secret-at-least32characters'},session={user:{id:'fictional-actor'},session:{id:'fictional-session'}},base='/api/orgs/fictional-org/participation-recurrence';
function fixture({signedIn=true,preflightError=null,rateError=null}={}){const tx=[];let sends=0;const db={async tx(user,org,fn,options){tx.push(options);if(preflightError)throw preflightError;return{};},async limit(){if(rateError)throw rateError;}};
  const handle=createHandler({settings,db,auth:{api:{async getSession(){return signedIn?session:null;}}},send:async()=>{sends++;throw Error('No provider');},participationTransport:async()=>{sends++;throw Error('No provider');}});
  return{handle,tx,sends:()=>sends,request:(suffix,{method='POST',body='{}',token=true,headers={}}={})=>new Request(settings.origin+base+suffix,{method,headers:{origin:settings.origin,'content-type':'application/json',...(token?{'x-csrf-token':csrf(session.session.id,settings.secret)}:{}),...headers},...(['GET','HEAD'].includes(method)?{}:{body})})};}
test('RR-HEADER-04 namespace auth/CSRF/path/method/body/rate and success responses all retain no-referrer',async()=>{
  const cases=[[{signedIn:false},'/preview',{},401],[{},'/preview',{token:false},403],[{},'/unknown',{},404],[{},'/history',{method:'HEAD'},405],[{},'/preview',{body:'{"x":1,"x":2}'},422],[{preflightError:new HttpError(403,'role','Unavailable')},'/preview',{},403],[{rateError:new HttpError(429,'rate','Wait')},'/preview',{},429],[{},'/history',{method:'GET'},200]];
  for(const [setup,path,options,status]of cases){const f=fixture(setup),r=await f.handle(f.request(path,options));assert.equal(r.status,status);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(f.sends(),0);}
});
