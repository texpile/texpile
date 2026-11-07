// a package read from its source: what its entrypoint exports through its own imports, each function's parameters,
// whether a call is block-level, what a value prints
import { describe, it, expect } from 'vitest';
import { scanPackage } from '$lib/languages/typst/knowledge';

const FILES: Record<string, string> = {
	'typst.toml': '[package]\nname = "demo"\nversion = "1.0.0"\nentrypoint = "src/lib.typ"\n',
	'src/lib.typ':
		'#import "inner.typ": term, note\n#import "values.typ": *\n#let cite-it(key) = cite(label(key))\n#let gls-like = term.with(plural: true)\n',
	'src/inner.typ':
		'#let term(key, plural: false) = box[#key]\n#let note(body, title: none) = block(inset: 4pt)[*#title* #body]\n#let hidden = 1\n',
	'src/values.typ': '#let etal = emph[et~al.]\n#let indent = h(2em)\n#let colors = (red, blue)\n'
};

function scanned() {
	return scanPackage(
		'@preview/demo:1.0.0',
		(path) => FILES[path] ?? null,
		() => null
	);
}

describe('scanPackage', () => {
	it('exports what the entrypoint binds, through its imports and nothing else', () => {
		const { names } = scanned();
		expect(Object.keys(names).sort()).toEqual(['cite-it', 'colors', 'etal', 'gls-like', 'indent', 'note', 'term']);
		expect(names['gls-like']).toEqual({ kind: 'function', alias: 'term' });
	});

	it('reads parameters, block level and roles from the bodies', () => {
		const { names } = scanned();
		expect(names.term.block).toBe(false);
		expect(names.note.block).toBe(true);
		expect(names.term.params).toEqual([
			{ name: 'key', positional: true, required: true, content: true, role: 'text' },
			{ name: 'plural', named: true, default: 'false' }
		]);
		expect(names['cite-it'].params?.[0].role).toBe('citekey');
	});

	it('reads what a value prints and the Typst it is written in', () => {
		const { names } = scanned();
		expect(names.etal).toMatchObject({ kind: 'value', prints: 'et\u00a0al.', block: false });
		expect(names.indent).toMatchObject({ prints: '', value: 'h(2em)' });
		expect(names.colors.prints).toBeUndefined();
	});

	it('reads the part of the title block a template hands a parameter to', () => {
		const lib = '#let conf(name: none, short: none, draft: none, doc) = {\n  set document(author: name, title: draft + short)\n  doc\n}\n';
		const files: Record<string, string> = { 'typst.toml': '[package]\nentrypoint = "lib.typ"\n', 'lib.typ': lib };
		const { names } = scanPackage(
			'@preview/conf:1.0.0',
			(path) => files[path] ?? null,
			() => null
		);
		expect(names.conf.params?.map((p) => p.part ?? null)).toEqual(['author', null, null, null]);
	});

	it('reads where a rest parameter goes and that a state update prints nothing', () => {
		const lib =
			'#let box-of(title, ..blockargs) = block(width: 100%, ..blockargs.named(), title)\n#let step = state("n", 0)\n#let next = {\n  step.update(n => n + 1)\n}\n';
		const files: Record<string, string> = { 'typst.toml': '[package]\nentrypoint = "lib.typ"\n', 'lib.typ': lib };
		const { names } = scanPackage(
			'@preview/sink:1.0.0',
			(path) => files[path] ?? null,
			() => null
		);
		expect(names['box-of'].params?.find((p) => p.variadic)?.into).toBe('block');
		expect(names.next.prints).toBe('');
	});
});
