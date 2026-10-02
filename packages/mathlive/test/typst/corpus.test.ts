// Reads every equation in a folder of .typ files and checks the three things editing depends on:
// each reads without error, an untouched one writes back byte for byte, and one rebuilt
// entirely from its structure (what an edit does to the parts it reaches) reads back as the
// same structure. Inert unless TYPST_CORPUS_DIR names the folder.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTypstMath, hasTypstError } from 'texpile-typst-syntax-wasm';
import { configureTypst } from '../../src/public/mathlive-ssr';
import { Atom } from '../../src/core/atom-class';
import { readTypst } from '../../src/typst/read/read';
import { atomToTypst } from '../../src/typst/write';

const dir = process.env.TYPST_CORPUS_DIR;

function* typFiles(folder: string): Generator<string> {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const at = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* typFiles(at);
    else if (entry.name.endsWith('.typ')) yield at;
  }
}

/** every `$...$` in a file, roughly: comments skipped, `\$` honored */
function equations(text: string): string[] {
  const stripped = text
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/(?<!\\)\$((?:\\.|[^$\\])*)\$/gs)]
    .map((m) => m[1])
    .filter((inner) => inner.trim() && inner.length < 800);
}

function rootOf(src: string): Atom {
  const reading = readTypst(src);
  const root = new Atom({ type: 'root', body: reading.atoms });
  root.verbatimTypst = src;
  root.typstSpelling = { open: reading.lead, close: reading.trail };
  return root;
}

/** what an edit reaching every atom would do: no verbatim source left anywhere */
function forget(root: Atom): Atom {
  for (const atom of [root, ...root.children]) atom.isDirty = true;
  return root;
}

const structure = (root: Atom) =>
  Atom.serialize(root.body ?? [], { defaultMode: 'math' });

describe.skipIf(!dir)('typst corpus', () => {
  it('reads, keeps and rebuilds every equation', () => {
    configureTypst({ parse: parseTypstMath });
    const seen = new Set<string>();
    const failures: Record<string, string[]> = {};
    const fail = (kind: string, detail: string) =>
      (failures[kind] ??= []).length < 15 && failures[kind].push(detail);
    let total = 0;
    for (const file of typFiles(dir!)) {
      for (const src of equations(fs.readFileSync(file, 'utf8'))) {
        if (seen.has(src) || hasTypstError(parseTypstMath(src))) continue;
        seen.add(src);
        total++;
        let root: Atom;
        try {
          root = rootOf(src);
        } catch (e) {
          fail('read throws', `${src} :: ${e}`);
          continue;
        }
        if (atomToTypst(root) !== src) fail('untouched', src);
        const rebuilt = atomToTypst(forget(rootOf(src)));
        if (hasTypstError(parseTypstMath(rebuilt))) {
          fail('rebuilt does not parse', `${src}  =>  ${rebuilt}`);
          continue;
        }
        if (structure(rootOf(rebuilt)) !== structure(rootOf(src)))
          fail('rebuilt reads differently', `${src}  =>  ${rebuilt}`);
      }
    }
    console.log(`${total} equations`);
    expect(failures).toEqual({});
  });
});
