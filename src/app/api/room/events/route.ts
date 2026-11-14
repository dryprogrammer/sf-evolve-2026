import { errorResponse } from '@/lib/http';
import { requireSession, resolveActor, room } from '@/lib/room-server';
import type { RoomEvent } from '@/lib/room';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const QUEUE_LIMIT=64;
/**
 * Fetch-readable server-sent events (Authorization header, never a URL token).
 * Carries presence and revision numbers only; clients fetch their own projections.
 */
export async function GET(request:Request){try{
 const session=requireSession(await resolveActor(request));const encoder=new TextEncoder();
 let unsubscribe=()=>{},ping:ReturnType<typeof setInterval>|undefined,closed=false;
 const stream=new ReadableStream<Uint8Array>({start(controller){
  const close=()=>{if(closed)return;closed=true;clearInterval(ping);unsubscribe();try{controller.close();}catch{}};
  const send=(event:RoomEvent)=>{if(closed)return false;if((controller.desiredSize??1)<=0)return false;controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));return true;};
  unsubscribe=room().subscribe(session,send,close);
  ping=setInterval(()=>{if(!closed&&(controller.desiredSize??1)>0)controller.enqueue(encoder.encode(': keep-alive\n\n'));},10000);
  request.signal.addEventListener('abort',close);
 },cancel(){closed=true;clearInterval(ping);unsubscribe();}},new CountQueuingStrategy({highWaterMark:QUEUE_LIMIT}));
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no',Connection:'keep-alive'}});
}catch(e){return errorResponse(e);}}
