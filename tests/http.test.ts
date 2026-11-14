import { afterEach, describe,it,expect } from 'vitest';
import { body,fixtureOnly,principal,sameOrigin,errorResponse } from '../src/lib/http';
const old=process.env.FACTORY_MODE;
afterEach(()=>{if(old===undefined)delete process.env.FACTORY_MODE;else process.env.FACTORY_MODE=old;});
const req=(origin?:string,host='localhost:3100')=>new Request('http://0.0.0.0:3100/api/factory',{method:'POST',headers:{host,'Content-Type':'application/json',...(origin?{origin}:{})},body:'{}'});
describe('fixture HTTP trust boundary',()=>{
 it('is closed unless fixture mode is explicit',()=>{delete process.env.FACTORY_MODE;expect(fixtureOnly).toThrow('disabled');process.env.FACTORY_MODE='live';expect(fixtureOnly).toThrow('disabled');});
 it('checks browser Host rather than the internal Next bind address',()=>{process.env.FACTORY_MODE='fixture';expect(()=>sameOrigin(req('http://localhost:3100'))).not.toThrow();expect(()=>sameOrigin(req('https://evil.example'))).toThrow('same-origin');expect(()=>sameOrigin(req())).toThrow('same-origin');});
 it('rejects browser cross-site metadata and non-JSON mutations',()=>{process.env.FACTORY_MODE='fixture';const r=req('http://localhost:3100');r.headers.set('sec-fetch-site','cross-site');expect(()=>sameOrigin(r)).toThrow();r.headers.set('sec-fetch-site','same-origin');r.headers.set('Content-Type','text/plain');expect(()=>sameOrigin(r)).toThrow('JSON');});
 it('chooses only known fixture principals and does not accept supplied actor headers',()=>{process.env.FACTORY_MODE='fixture';const r=req('http://localhost:3100');r.headers.set('x-actor','observer');expect(principal(r).id).toBe('maya');r.headers.set('cookie','factory_persona=observer');expect(principal(r).kind).toBe('agent');r.headers.set('cookie','factory_persona=administrator');expect(()=>principal(r)).toThrow();});
 it('rejects malformed and oversized bodies',async()=>{await expect(body(new Request('http://local',{method:'POST',body:'no'}))).rejects.toThrow('JSON');await expect(body(new Request('http://local',{method:'POST',body:'[]'}))).rejects.toThrow('JSON');await expect(body(new Request('http://local',{method:'POST',body:JSON.stringify({text:'x'.repeat(140000)})}))).rejects.toThrow('large');expect(errorResponse(new Error()).status).toBe(503);});
});
