// @vitest-environment jsdom
// The citation editor and the environment header write only what still reads back as what they
// edit: a supplement that closes its brackets, a call that is still an environment.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { referenceStore } from '$lib/stores/editorStore';
import { supplementFromField } from '$lib/languages/typst/visual/plugins/ref/node/refSupplement';
import { typstRefFace } from '$lib/languages/typst/visual/plugins/ref/node/typstRefFace';
import { citeFormOptions } from '$lib/languages/typst/visual/plugins/ref/node/citeForms';
import { argsFromField, envHeadReadsBack, readEnvHead } from '$lib/languages/typst/visual/extensions/env/envHeadEdits';
import { definedFunctions, ownFunctions } from '$lib/languages/typst/visual/envNames';
import TypstRefEditForm from '$lib/languages/typst/visual/plugins/ref/node/TypstRefEditForm.svelte';

const BIB = [{ key: 'knuth84', entrytype: 'book', author: 'Knuth, Donald E.', year: '1984', title: 'The TeXbook' }];

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	referenceStore.current = null;
	document.body.innerHTML = '';
});

function target(): HTMLElement {
	return document.body.appendChild(document.createElement('div'));
}

function parse(source: string) {
	return typstToProseMirror(source).doc;
}

describe('the supplement field', () => {
	it('keeps typst markup that closes its brackets, escapes what would not', () => {
		expect(supplementFromField('p. 7', parse)).toBe('p. 7');
		expect(supplementFromField('pp. *3*--5', parse)).toBe('pp. *3*--5');
		expect(supplementFromField('see [x', parse)).toBe('see \\[x');
		expect(supplementFromField('a // b', parse)).toBe('a \\// b');
		expect(supplementFromField('', parse)).toBeNull();
	});
});

describe('how a reference reads', () => {
	it('a bibliography key reads as its citation, in the form it asks for', () => {
		const face = (attrs: Record<string, unknown>) => typstRefFace({ target: 'knuth84', supplement: null, form: null, ...attrs }, BIB).text;
		expect(face({})).toBe('(Knuth 1984)');
		expect(face({ supplement: 'p. 7' })).toBe('(Knuth 1984, p. 7)');
		expect(face({ form: 'prose', supplement: 'p. 7' })).toBe('Knuth (1984, p. 7)');
		expect(face({ form: 'author' })).toBe('Knuth');
		expect(face({ form: 'year' })).toBe('1984');
		expect(face({ form: 'full' })).toBe('Knuth, The TeXbook, 1984');
	});

	it('anything else reads as written', () => {
		expect(typstRefFace({ target: 'sec:intro', supplement: 'Chapter', form: null }, BIB)).toEqual({
			text: '@sec:intro[Chapter]',
			known: false,
			title: 'sec:intro',
			kind: 'written'
		});
		expect(typstRefFace({ target: 'knuth84', supplement: null, form: null }, null).text).toBe('@knuth84');
	});

	it("the form list keeps the citation's own spelled-out normal form", () => {
		expect(citeFormOptions(null).map((o) => o.value)).toEqual(['auto', 'prose', 'author', 'year', 'full']);
		expect(citeFormOptions('normal').map((o) => o.value)).toContain('normal');
	});
});

describe('the citation editor', () => {
	it('writes a typed supplement and a chosen form', () => {
		referenceStore.current = BIB;
		const onUpdate = vi.fn();
		const node = typSchema.nodes.typ_ref.create({ target: 'knuth84' });
		app = mount(TypstRefEditForm, { target: target(), props: { node, onUpdate, onChangeKey: () => {}, parse, dropdownOpen: true } });
		flushSync();
		const field = document.querySelector<HTMLInputElement>('input[type="text"]')!;
		field.value = 'p. 7';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(onUpdate).toHaveBeenLastCalledWith({ supplement: 'p. 7' });
		[...document.querySelectorAll('button')].find((b) => b.textContent?.trim().length)!.click();
		flushSync();
		const select = [...document.querySelectorAll('select')].pop()!;
		select.value = 'prose';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onUpdate).toHaveBeenLastCalledWith({ form: 'prose' });
	});

	it('offers a reference to a label its supplement only', () => {
		const node = typSchema.nodes.typ_ref.create({ target: 'sec:intro', supplement: 'Chapter' });
		app = mount(TypstRefEditForm, {
			target: target(),
			props: { node, onUpdate: () => {}, onChangeKey: () => {}, parse, dropdownOpen: true }
		});
		flushSync();
		expect(document.body.textContent).toContain('@sec:intro');
		expect(document.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Chapter');
		expect(document.querySelector('select')).toBeNull();
	});
});

describe('the environment header', () => {
	it('takes only a head that is still an environment', () => {
		expect(envHeadReadsBack('theorem', null)).toBe(true);
		expect(envHeadReadsBack('std.block', 'inset: 1em')).toBe(true);
		expect(envHeadReadsBack('block', 'inset: (1em')).toBe(false);
		expect(envHeadReadsBack('underline', null)).toBe(false);
		expect(envHeadReadsBack('not a name', null)).toBe(false);
		expect(argsFromField('', null)).toBeNull();
		expect(argsFromField('', '')).toBe('');
		expect(argsFromField('  ', 'x')).toBeNull();
	});

	it('reads a typed head as the call and label it stands for, and nothing while it is half typed', () => {
		expect(readEnvHead('#block(inset: 2em) <box>')).toEqual({ name: 'block', args: 'inset: 2em', label: 'box' });
		expect(readEnvHead('#theorem')).toEqual({ name: 'theorem', args: null, label: null });
		expect(readEnvHead('#block(inset: (1em)')).toBeNull();
		expect(readEnvHead('#strong')).toBeNull();
		expect(readEnvHead('#lemma(title: "Zor')).toBeNull();
	});
});

describe('the functions a file defines, which Insert offers', () => {
	it('tells one a maker made from one written out', async () => {
		const src = '#let theorem = thmbox("theorem", "Theorem")\n#let note(body) = block(body)\n#let x = 4\n#let (a, b) = (1, 2)\n';
		expect(await ownFunctions(src)).toEqual([
			{ name: 'theorem', maker: 'thmbox' },
			{ name: 'note', maker: null }
		]);
	});

	it('names a function written as a closure by its own name', async () => {
		expect(await definedFunctions('#let f = (x) => x\n#let g = x => g(x)\n#let n = 4')).toEqual(['f', 'g']);
	});

	it('leaves out a let inside code, which defines no environment', async () => {
		expect(await definedFunctions('#let f(x) = { let y = g(x); y }\n#block[#let lem = thm("l")]')).toEqual(['f', 'lem']);
	});
});
