import { Command } from '@/lib/contracts';
import { body, errorResponse, principal, sameOrigin } from '@/lib/http';
import { store } from '@/lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){ try{return Response.json(await store().get(principal(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);} }
export async function POST(request:Request){try{sameOrigin(request); const actor=principal(request); const command=await body(request) as Command; return Response.json(await store().execute(actor,command),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);} }
