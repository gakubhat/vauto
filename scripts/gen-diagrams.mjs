#!/usr/bin/env node
/**
 * Generates the Mermaid state diagrams in docs/flows/*.md from
 * docs/flows/transitions.json.
 *
 *   node scripts/gen-diagrams.mjs
 *
 * Everything between the DIAGRAM markers in each markdown file is replaced,
 * so the hand-written tables around them are preserved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'docs/flows/transitions.json'), 'utf8'));

/** Mermaid labels break on a few characters - keep them plain. */
function safe(text) {
  return String(text)
    .replace(/[:;]/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function render(role) {
  const spec = data[role];
  const lines = ['stateDiagram-v2'];

  // State descriptions as notes would clutter - emit states in order first so
  // the layout is stable, then every labelled transition.
  for (const [name, desc] of Object.entries(spec.states)) {
    lines.push(`    ${name} : ${safe(desc)}`);
  }
  lines.push('');

  const start = spec.transitions.find((t) => t.from === '[*]');
  if (start) lines.push(`    [*] --> ${start.to} : ${safe(start.action)}`);

  for (const t of spec.transitions) {
    if (t.from === '[*]') continue;
    lines.push(`    ${t.from} --> ${t.to} : ${safe(t.action)}`);
  }

  // Terminal states: anything with no outgoing edge other than itself.
  const hasOutgoing = new Set(spec.transitions.filter((t) => t.from !== t.to).map((t) => t.from));
  for (const name of Object.keys(spec.states)) {
    if (!hasOutgoing.has(name)) lines.push(`    ${name} --> [*]`);
  }

  return lines.join('\n');
}

function inject(file, role) {
  const p = path.join(root, 'docs/flows', file);
  const md = fs.readFileSync(p, 'utf8');
  const block = `\`\`\`mermaid\n${render(role)}\n\`\`\``;
  const startMarker = '<!-- DIAGRAM:START -->';
  const endMarker = '<!-- DIAGRAM:END -->';

  if (md.includes(startMarker) && md.includes(endMarker)) {
    const before = md.slice(0, md.indexOf(startMarker) + startMarker.length);
    const after = md.slice(md.indexOf(endMarker));
    fs.writeFileSync(p, `${before}\n\n${block}\n\n${after}`);
  } else {
    throw new Error(`${file} is missing ${startMarker} / ${endMarker} markers`);
  }
  console.log(`${file}: ${data[role].transitions.length} transitions`);
}

inject('rider.md', 'rider');
inject('driver.md', 'driver');
console.log('done');
