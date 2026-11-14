import { FactoryError, Principal, principals } from './contracts';
export function fixtureOnly(){ if(process.env.FACTORY_MODE!=='fixture') throw new FactoryError('disabled','The fixture pilot is disabled. Live authentication is not implemented.',503); }
export function principal(request:Request):Principal {
 fixtureOnly(); const cookie=request.headers.get('cookie')??''; const id=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('factory_persona='))?.slice('factory_persona='.length)??'maya';
 const actor=principals.find(p=>p.id===id); if(!actor) throw new FactoryError('denied','Unknown fixture persona.',403); return actor;
}
export function sameOrigin(request:Request){
 fixtureOnly(); const origin=request.headers.get('origin'); if(!origin||origin!==new URL(request.url).origin) throw new FactoryError('denied','A same-origin request is required.',403);
 if(!(request.headers.get('content-type')??'').startsWith('application/json')) throw new FactoryError('validation','JSON content is required.',415);
}
export async function body(request:Request):Promise<unknown>{
 const reader=request.body?.getReader(); if(!reader) throw new FactoryError('validation','A request body is required.'); let length=0; const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>131072){await reader.cancel();throw new FactoryError('validation','Request too large.',413);}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try { const parsed=JSON.parse(new TextDecoder().decode(bytes)); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw Error();return parsed; } catch {throw new FactoryError('validation','A JSON object is required.');}
}
export function errorResponse(error:unknown):Response{
 if(error instanceof FactoryError) return Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:{'Cache-Control':'no-store'}});
 console.error('Factory request failed:',error instanceof Error?error.name:'unknown');return Response.json({error:{code:'unavailable',message:'The command could not be confirmed. Retry the same command key.'}},{status:503});
}
