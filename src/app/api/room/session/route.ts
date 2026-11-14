import { FactoryError } from '@/lib/contracts';
import { body, errorResponse, sameOrigin } from '@/lib/http';
import { requireSession, resolveActor, room } from '@/lib/room-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
/** Restore: validates this tab's credential and returns its own participant. */
export async function GET(request:Request){try{const session=requireSession(await resolveActor(request));return Response.json({session,instanceId:room().instanceId},{headers:noStore});}catch(e){return errorResponse(e);}}
/**
 * enter: explicit participant selection issues a NEW session (no default identity).
 * fork: a duplicated tab copies the credential; it gets its own session for the same participant.
 * leave: revokes only this session.
 */
export async function POST(request:Request){try{
 sameOrigin(request);const input=await body(request) as {action?:unknown;participantId?:unknown};
 if(input.action==='enter'){const issued=await room().enter(input.participantId);return Response.json({session:issued,instanceId:room().instanceId},{status:201,headers:noStore});}
 const session=requireSession(await resolveActor(request));
 if(input.action==='fork'){const issued=await room().enter(session.participantId);return Response.json({session:issued,instanceId:room().instanceId},{status:201,headers:noStore});}
 if(input.action==='leave'){await room().leave(session);return Response.json({ok:true},{headers:noStore});}
 throw new FactoryError('validation','Unknown session action.');
}catch(e){return errorResponse(e);}}
