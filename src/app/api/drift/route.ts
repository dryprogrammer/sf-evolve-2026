import recorded from '@/lib/drift/data/snapshot.json';
import { validateSnapshot } from '@/lib/drift/validate';

export const dynamic = 'force-dynamic';
/** Read-only recorded export: no upstream calls, database, or model credentials. */
export async function GET() {
 try {
  return Response.json(validateSnapshot(recorded), { headers: { 'Cache-Control': 'private, no-store' } });
 } catch {
  return Response.json({ error: 'Recorded evidence is invalid or unavailable.' }, { status: 503 });
 }
}
