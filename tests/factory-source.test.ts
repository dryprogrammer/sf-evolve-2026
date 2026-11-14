import { describe, expect, it, vi } from 'vitest';
import { FactoryApiSource, contentDigest } from '../src/lib/factory-source';

// Contract tests only: every response is mocked, not live API integration evidence.
const ids = {
  work: '11111111-1111-4111-8111-111111111111',
  requirements: '22222222-2222-4222-8222-222222222222',
  blueprint: '33333333-3333-4333-8333-333333333333',
  artifact: '44444444-4444-4444-8444-444444444444',
  supplement: '55555555-5555-4555-8555-555555555555',
  revision: '66666666-6666-4666-8666-666666666666',
};
const api = 'https://api.factory.8090.dev/v2/external-api';
const project = 'https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200';
const updatedAt = '2026-11-14T12:00:00.000Z';
type Data = Record<string, unknown>;
function records(): Record<string, Data> {
  const doc = (id: string, title: string): Data => ({ id, title, markdown_content: `# ${title}\nComplete mocked Markdown.`, version_number: 3, version_id: ids.revision, updated_at: updatedAt });
  return {
    [`/work_orders/${ids.work}`]: {
      id: ids.work, title: 'Mock API work', markdown_content: '# Work\nFull work order.',
      work_order_number: 42, status: 'in_progress', updated_at: updatedAt,
      connectedContext: [
        { resourceType: 'requirements_document', resourceId: ids.requirements },
        { resourceType: 'blueprint', resourceId: ids.blueprint },
        { resourceType: 'artifact', resourceId: ids.artifact },
      ],
    },
    [`/requirements/${ids.requirements}`]: doc(ids.requirements, 'Requirements'),
    [`/blueprints/${ids.blueprint}`]: doc(ids.blueprint, 'Blueprint'),
    [`/artifacts/${ids.artifact}`]: { id: ids.artifact, name: 'Context', type: 'document', markdown_content: '# Context\nComplete context.', updated_at: updatedAt },
    [`/artifacts/${ids.supplement}`]: { id: ids.supplement, name: 'Supplement', type: 'document', markdown_content: '# Supplement\nExplicit supplemental context.', updated_at: updatedAt },
  };
}
function mocked(data = records(), override?: (path: string, visit: number) => Response | undefined) {
  const visits = new Map<string, number>();
  const transport = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (!url.startsWith(api + '/')) throw new Error('Unexpected URL: ' + url);
    const path = url.slice(api.length);
    const visit = (visits.get(path) ?? 0) + 1;
    visits.set(path, visit);
    const replacement = override?.(path, visit);
    if (replacement) return replacement;
    if (!data[path]) throw new Error('Unexpected record: ' + path);
    return Response.json({ data: data[path] });
  });
  return { transport, source: new FactoryApiSource(ids.work, [ids.supplement], 'mock-test-key-not-a-secret', transport) };
}

describe('FactoryApiSource mocked read contract (NOT live integration evidence)', () => {
  it('retrieves two complete cuts of direct documents and explicit supplements with provenance', async () => {
    const { source, transport } = mocked();
    const work = await source.read();
    expect(work).toMatchObject({ id: 'WO-42', title: 'Mock API work', description: '# Work\nFull work order.', status: 'in progress', sourceAvailable: true, sourceVersion: 1 });
    expect(Number.isFinite(Date.parse(work.sourceRetrievedAt!))).toBe(true);
    expect(work.sourceCoverage).toContain('No transitive records');
    expect(work.evidence).toHaveLength(5);
    expect(transport).toHaveBeenCalledTimes(10);
    for (const path of Object.keys(records())) {
      expect(transport.mock.calls.filter(([url]) => url === api + path)).toHaveLength(2);
    }
    for (const [, options] of transport.mock.calls) {
      expect(options).toMatchObject({ headers: { Authorization: 'Bearer mock-test-key-not-a-secret', Accept: 'application/json' }, cache: 'no-store', redirect: 'error' });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
    for (const evidence of work.evidence) {
      expect(evidence).toMatchObject({ complete: true, permitted: true, provenance: { provider: 'factory', updatedAt, contentDigest: contentDigest({ title: evidence.title, content: evidence.content }) } });
      expect(evidence.provenance?.resourceId).toBe(evidence.id.split(':')[1]);
      expect(evidence.provenance?.supplemental).toBe(evidence.id.endsWith(ids.supplement));
    }
    const req = work.evidence.find(e => e.id === `requirements_document:${ids.requirements}`)!;
    expect(req).toMatchObject({ version: 3, sourceRef: `${project}/requirements/${ids.requirements}`, provenance: { revisionId: ids.revision, resourceType: 'requirements_document' } });
    expect(work.evidence.find(e => e.id === `blueprint:${ids.blueprint}`)?.sourceRef).toBe(`${project}/blueprints/${ids.blueprint}`);
    expect(work.evidence[0].sourceRef).toBe(`${project}/work-orders/42`);
    expect(work.evidence.find(e => e.id === `artifact:${ids.supplement}`)?.sourceRef).toBe(`${project}/knowledge-base/${ids.supplement}`);
  });

  it('deduplicates direct links and a supplement already directly connected', async () => {
    const data = records();
    const work = data[`/work_orders/${ids.work}`];
    work.connectedContext = [...work.connectedContext as Data[], { resourceType: 'artifact', resourceId: ids.supplement }, { resourceType: 'blueprint', resourceId: ids.blueprint }];
    const { source, transport } = mocked(data);
    expect((await source.read()).evidence).toHaveLength(5);
    expect(transport).toHaveBeenCalledTimes(10);
  });

  it.each([403, 404, 500])('fails closed on HTTP %s instead of using cached or partial evidence', async status => {
    const { source } = mocked(records(), (path, visit) => path === `/blueprints/${ids.blueprint}` && visit === 2 ? new Response('', { status }) : undefined);
    await expect(source.read()).rejects.toMatchObject({ code: status === 500 ? 'unverifiable_evidence' : 'source_denied', status: status === 500 ? 503 : 403 });
  });

  it('fails closed on transport failure', async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new Error('mock offline'); });
    await expect(new FactoryApiSource(ids.work, [], 'mock-key', transport).read()).rejects.toMatchObject({ code: 'unverifiable_evidence', status: 503 });
  });

  it.each(Object.keys(records()))('rejects missing Markdown in %s', async path => {
    const data = records();
    delete data[path].markdown_content;
    await expect(mocked(data).source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it.each(Object.keys(records()))('rejects a mismatched returned ID in %s', async path => {
    const data = records();
    data[path].id = ids.revision;
    await expect(mocked(data).source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it('rejects unsupported direct resource types without skipping them', async () => {
    const data = records();
    data[`/work_orders/${ids.work}`].connectedContext = [{ resourceType: 'feedback', resourceId: ids.artifact }];
    await expect(mocked(data).source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it.each([ids.artifact, ids.supplement])('rejects file-backed artifacts, including supplemental %s', async id => {
    const data = records();
    data[`/artifacts/${id}`].type = 'file';
    await expect(mocked(data).source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it.each(Object.keys(records()))('rejects content changed between complete cuts in %s', async path => {
    const data = records();
    const { source } = mocked(data, (requested, visit) => requested === path && visit === 2 ? Response.json({ data: { ...data[path], markdown_content: 'Changed second cut' } }) : undefined);
    await expect(source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it.each(['version_id', 'updated_at'])('rejects provenance changes between cuts: %s', async field => {
    const data = records(), path = `/requirements/${ids.requirements}`;
    const { source } = mocked(data, (requested, visit) => requested === path && visit === 2 ? Response.json({ data: { ...data[path], [field]: field === 'version_id' ? ids.work : '2026-11-14T13:00:00.000Z' } }) : undefined);
    await expect(source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it.each(['not-json', JSON.stringify({ data: null }), JSON.stringify({ data: [] }), JSON.stringify(records()[`/work_orders/${ids.work}`])])('rejects invalid response envelopes: %s', async body => {
    const { source } = mocked(records(), () => new Response(body));
    await expect(source.read()).rejects.toMatchObject({ code: 'unverifiable_evidence' });
  });

  it('validates configured IDs before any transport call', () => {
    const transport = vi.fn<typeof fetch>();
    expect(() => new FactoryApiSource('WO-42', [], 'mock-key', transport)).toThrow();
    expect(() => new FactoryApiSource(ids.work, ['not-a-uuid'], 'mock-key', transport)).toThrow();
    expect(() => new FactoryApiSource(ids.work, Array(6).fill(ids.artifact), 'mock-key', transport)).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
