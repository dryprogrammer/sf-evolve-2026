import { Command } from '@/lib/contracts';
import { body, errorResponse, sameOrigin } from '@/lib/http';
import { executeAndNotify, resolveActor } from '@/lib/room-server';
import { store } from '@/lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){ try{const {actor}=await resolveActor(request);return Response.json(await store().get(actor),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);} }
export async function POST(request:Request){try{sameOrigin(request); const actor=await resolveActor(request); const command=await body(request) as Command; return Response.json(await executeAndNotify(actor,command),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);} }
