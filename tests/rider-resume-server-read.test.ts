import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the ORIGINAL Firebase list method without initializing native auth.
const source = ts.createSourceFile('firebase.ts', readFileSync(resolve(process.cwd(), 'lib/firebase.ts'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const methods: ts.MethodDeclaration[] = [];
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'list') methods.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
if (methods.length !== 1) throw new Error(`Expected one Firebase list owner, got ${methods.length}`);
const compiled = ts.transpileModule(`const owner = { ${methods[0].getText(source)} }; return owner.list;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function setup() {
  const snapshot = { docs: [{ id: 'ride-a', data: () => ({ rider_id: 'rider-a' }) }] };
  const env = {
    db: {}, collection: vi.fn(() => 'collection'), where: vi.fn((...args) => args), orderBy: vi.fn((...args) => args), firestoreLimit: vi.fn((value) => value), query: vi.fn((...args) => args),
    getDocs: vi.fn().mockResolvedValue(snapshot), getDocsFromServer: vi.fn().mockResolvedValue(snapshot),
    snapshotToArray: (snap: typeof snapshot) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
  const list = new Function(...Object.keys(env), compiled)(...Object.values(env)) as (...args: any[]) => Promise<unknown>;
  return { ...env, list };
}

describe('authoritative Rider resume Firestore read', () => {
  it('uses a server-only query with the Rider ownership filter', async () => {
    const h = setup();
    expect(await h.list('rides', { rider_id: 'rider-a' }, 'created_date', 'desc', undefined, { source: 'server' })).toEqual([{ id: 'ride-a', rider_id: 'rider-a' }]);
    expect(h.where).toHaveBeenCalledWith('rider_id', '==', 'rider-a');
    expect(h.getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(h.getDocs).not.toHaveBeenCalled();
  });
  it('does not silently fall back to stale cache when the server is unavailable', async () => {
    const h = setup(); h.getDocsFromServer.mockRejectedValue(new Error('offline'));
    await expect(h.list('rides', { rider_id: 'rider-a' }, 'created_date', 'desc', undefined, { source: 'server' })).rejects.toThrow('offline');
    expect(h.getDocs).not.toHaveBeenCalled();
  });
  it('preserves normal list behavior and query limits for unrelated callers', async () => {
    const h = setup(); await h.list('rides', { rider_id: 'rider-a' }, 'created_date', 'desc', 50);
    expect(h.getDocs).toHaveBeenCalledTimes(1);
    expect(h.getDocsFromServer).not.toHaveBeenCalled();
    expect(h.firestoreLimit).toHaveBeenCalledWith(50);
  });
});
