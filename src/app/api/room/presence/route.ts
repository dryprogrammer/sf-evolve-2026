import { body, errorResponse, sameOrigin } from '@/lib/http';
import { requireSession, resolveActor, room } from '@/lib/room-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Heartbeat (no position) or a movement update for the caller's own session only. */
export async function POST(request:Request){try{
 sameOrigin(request);const session=requireSession(await resolveActor(request));const input=await body(request) as {x?:unknown;y?:unknown;facing?:unknown;seq?:unknown};
 if(input.x===undefined&&input.y===undefined)return Response.json({accepted:true,entry:room().heartbeat(session)},{headers:{'Cache-Control':'no-store'}});
 const result=room().move(session,input);return Response.json(result,{status:result.accepted?200:422,headers:{'Cache-Control':'no-store'}});
}catch(e){return errorResponse(e);}}
