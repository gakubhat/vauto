import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Docs drift guard.
 *
 * The flow diagrams are generated from transitions.json and stay in sync by
 * construction. Everything else - states tables, button tables, the admin route
 * list, the event list - is written by hand, and that is exactly where this
 * repo has drifted before. These checks fail the suite instead of relying on
 * someone remembering.
 */

const ROOT = path.resolve(process.cwd(), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const transitions = JSON.parse(read('docs/flows/transitions.json')) as Record<
  string,
  { states: Record<string, string>; transitions: Array<{ from: string; to: string }> }
>;

function statesTable(doc: string): string[] {
  // JS `.` does not cross newlines - capture with [\s\S].
  const m = /^## States\n([\s\S]*?)^## /m.exec(doc);
  if (!m) return [];
  return [...m[1].matchAll(/^\| `([a-z_]+)`/gm)].map((r) => r[1]);
}

describe('docs stay in sync with the code', () => {
  for (const role of ['rider', 'driver'] as const) {
    const doc = read(`docs/flows/${role}.md`);
    const inDoc = new Set(statesTable(doc));
    const inJson = new Set(Object.keys(transitions[role].states));

    it(`${role}: every documented state exists in transitions.json`, () => {
      expect([...inDoc].filter((s) => !inJson.has(s))).toEqual([]);
    });

    it(`${role}: every state in transitions.json is in the states table`, () => {
      expect([...inJson].filter((s) => !inDoc.has(s))).toEqual([]);
    });

    it(`${role}: every state referenced in the flow code is in transitions.json`, () => {
      const flow = read(`server/src/state/flows/${role}.ts`);
      const used = new Set([...flow.matchAll(/state === '([a-z_]+)'/g)].map((m) => m[1]));
      expect([...used].filter((s) => !inJson.has(s))).toEqual([]);
    });

    it(`${role}: every state named in an edge is a known state`, () => {
      const unknown = transitions[role].transitions
        .flatMap((t) => [t.from, t.to])
        .filter((s) => s !== '[*]' && !inJson.has(s));
      expect([...new Set(unknown)]).toEqual([]);
    });
  }

  it('every button the code can send is documented', () => {
    const sources = [
      read('server/src/whatsapp/templates.ts'),
      read('server/src/state/flows/rider.ts'),
      read('server/src/state/flows/driver.ts'),
    ].join('\n');

    const ids = new Set<string>();
    for (const m of sources.matchAll(/btn\('[a-z_]+',\s*'([a-z_]+)'/g)) ids.add(m[1]);
    for (const m of sources.matchAll(/startsWith\('([a-z_]+)'\)/g)) ids.add(m[1]);
    for (const m of sources.matchAll(/id:\s*'([a-z_]+)'/g)) ids.add(m[1]);

    const docs = read('docs/flows/rider.md') + read('docs/flows/driver.md');
    expect([...ids].filter((id) => !docs.includes(id))).toEqual([]);
  });

  it('every admin route is documented', () => {
    const src = read('server/src/routes/admin.ts');
    const routes = [...src.matchAll(/adminRouter\.(?:get|post|put|patch|delete)\('([^']+)'/g)].map(
      (m) => m[1],
    );
    const doc = read('docs/admin.md');
    expect(routes.filter((r) => !doc.includes(r))).toEqual([]);
  });

  it('every analytics event is listed in overview.md', () => {
    const files = [
      'server/src/lib/matching.ts',
      'server/src/state/flows/rider.ts',
      'server/src/state/flows/driver.ts',
      'server/src/routes/admin.ts',
      'server/src/lib/delete-user.ts',
    ];
    const src = files.map(read).join('\n');
    const types = [...src.matchAll(/recordEvent\('([a-z_]+)'/g)].map((m) => m[1]);
    const overview = read('docs/overview.md');
    expect([...new Set(types)].filter((t) => !overview.includes(t))).toEqual([]);
  });

  it('no doc carries a reference to the previous project', () => {
    const docs = [
      'docs/overview.md',
      'docs/admin.md',
      'docs/testing.md',
      'docs/local-setup.md',
      'docs/flows/rider.md',
      'docs/flows/driver.md',
      'AGENTS.md',
    ];
    const offenders = docs.filter((file) => {
      // stateDiagram-v2 is Mermaid syntax; jsonv2 is a Nominatim API param.
      const stripped = read(file).replace(/stateDiagram-v2/g, '').replace(/jsonv2/g, '');
      return /\bV2\b|\.v2-backup/.test(stripped);
    });
    expect(offenders).toEqual([]);
  });
});
