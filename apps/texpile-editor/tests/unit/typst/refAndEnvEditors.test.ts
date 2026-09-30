// @vitest-environment jsdom
// The citation editor and the environment header write only what still reads back as what they
// edit: a supplement that closes its brackets, a call that is still an environment.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { referenceStore } from '$lib/stores/editorStore';
import { supplementFromField } from '$lib/languages/typst/visual/extensions/ref/refSupplement';
import { typstRefFace } from '$lib/languages/typst/visual/extensions/ref/typstRefFace';
import { citeFormOptions } from '$lib/languages/typst/visual/extensions/ref/citeForms';
import { argsFromField, envHeadReadsBack } from '$lib/languages/typst/visual/extensions/env/envHeadEdits';
import { definedFunctions, environmentSuggestions } from '$lib/languages/typst/visual/envNames';
import TypstEnvHeader from '$lib/languages/typst/visual/extensions/env/TypstEnvHeader.svelte';
import TypstRefEditForm from '$lib/languages/typst/visual/extensions/ref/TypstRefEditForm.svelte';

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

/** types into a field and leaves it, the way the header commits */
function typeAndLeave(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new FocusEvent('blur'));
	flushSync();
}

describe('the supplement field', () => {
	it('keeps typst markup that closes its brackets, escapes what would not', () => {
		expect(supplementFromField('p. 7')).toBe('p. 7');
		expect(supplementFromField('pp. *3*--5')).toBe('pp. *3*--5');
		expect(supplementFromField('see [x')).toBe('see \\[x');
		expect(supplementFromField('a // b')).toBe('a \\// b');
		expect(supplementFromField('')).toBeNull();
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
			title: 'sec:intro'
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
		app = mount(TypstRefEditForm, { target: target(), props: { node, onUpdate, onChangeKey: () => {}, dropdownOpen: true } });
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
		app = mount(TypstRefEditForm, { target: target(), props: { node, onUpdate: () => {}, onChangeKey: () => {}, dropdownOpen: true } });
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

	function header(attrs: Record<string, unknown>, taken: string[] = []) {
		const updateAttrs = vi.fn();
		const node = typSchema.nodes.typ_env.create(attrs, typSchema.nodes.paragraph.create());
		app = mount(TypstEnvHeader, { target: target(), props: { node, updateAttrs, labelTaken: (name: string) => taken.includes(name) } });
		flushSync();
		const [name, label] = document.querySelectorAll('input');
		return { updateAttrs, name, args: document.querySelector('textarea')!, label };
	}

	it('writes arguments that parse and refuses ones that would break the call', () => {
		const h = header({ name: 'block', args: 'inset: 1em' });
		typeAndLeave(h.args, 'inset: (1em');
		expect(h.updateAttrs).not.toHaveBeenCalled();
		expect(h.args.value).toBe('inset: 1em');
		typeAndLeave(h.args, 'inset: 2em');
		expect(h.updateAttrs).toHaveBeenCalledWith({ args: 'inset: 2em' });
	});

	it('renames the call to another environment, never to a mark', () => {
		const h = header({ name: 'theorem' });
		typeAndLeave(h.name, 'strong');
		expect(h.updateAttrs).not.toHaveBeenCalled();
		typeAndLeave(h.name, 'lemma');
		expect(h.updateAttrs).toHaveBeenCalledWith({ name: 'lemma' });
	});

	it('sets, clears and refuses a taken label', () => {
		const h = header({ name: 'theorem', label: 'thm:a' }, ['thm:b']);
		typeAndLeave(h.label, 'thm:b');
		expect(h.updateAttrs).not.toHaveBeenCalled();
		typeAndLeave(h.label, 'thm:c');
		expect(h.updateAttrs).toHaveBeenLastCalledWith({ label: 'thm:c' });
		typeAndLeave(h.label, '');
		expect(h.updateAttrs).toHaveBeenLastCalledWith({ label: null });
	});
});

describe('names the Environment prompt offers', () => {
	it("the document's own definitions first, then the common ones", () => {
		const src = '#let theorem = thmbox("theorem", "Theorem")\n#let note(body) = block(body)\n#let x = 4\n#let (a, b) = (1, 2)\n';
		expect(definedFunctions(src)).toEqual(['theorem', 'note']);
		const offered = environmentSuggestions(src, ['claim']);
		expect(offered.slice(0, 3)).toEqual(['theorem', 'note', 'claim']);
		expect(offered).toContain('align');
		expect(new Set(offered).size).toBe(offered.length);
	});
});
