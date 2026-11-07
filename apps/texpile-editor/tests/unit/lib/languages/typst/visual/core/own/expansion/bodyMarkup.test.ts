// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';
import { joinedMarkup } from '$lib/languages/typst/visual/core/own/expansion/bodyMarkup';

async function faceIn(file: string, chip: string) {
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'main.typ', main: null, read: async () => null });
	return typstFace(chip);
}

describe('own bodies Typst would run', () => {
	it('draws a code body past its style rules, its lets and a test of its arguments', async () => {
		const file = [
			'#let epigraph(quote, attribution: none) = {',
			'  set text(size: 10pt)',
			'  [#emph(quote) #if attribution != none [(#attribution)]]',
			'}',
			'#let doi(ref) = {',
			'  let url = "https://doi.org/" + ref',
			'  link(url)[DOI #ref]',
			'}'
		].join('\n');
		expect((await faceIn(file, '#epigraph(attribution: [Pascal])[Short letters.]'))?.dom.textContent).toBe('Short letters. (Pascal)');
		expect((await faceIn(file, '#epigraph[Short letters.]'))?.dom.textContent?.trim()).toBe('Short letters.');
		const doi = await faceIn(file, '#doi("10.1/x")');
		expect(doi?.dom.querySelector('a')?.getAttribute('href')).toBe('https://doi.org/10.1/x');
		expect(doi?.dom.textContent).toBe('DOI 10.1/x');
	});

	it('reads a name of the file as it stands where the function is defined, and returns early', async () => {
		const file = [
			'#let annote = true',
			'#let annote = false',
			'#let insert(body, color) = {',
			'  if not annote { return body }',
			'  return text(body, fill: color)',
			'}',
			'#let ta(body) = insert(body, red)',
			'#let comment(body) = { if not annote { return [] }; text(blue, body) }',
			'#let FT(body) = comment(body)'
		].join('\n');
		expect((await faceIn(file, '#FT[Redo this]'))?.dom.textContent).toBe('FT');
		const face = await faceIn(file, '#ta[In other words]');
		expect(face?.dom.textContent).toBe('In other words');
		expect(face?.line).toBeFalsy();
		expect(face?.dom.querySelector('[data-textcolor]')).toBeNull();
	});

	it('keeps an embedded expression apart from joined text it would run into', async () => {
		expect(joinedMarkup(['#emph[a]', 'b'])).toBe('#emph[a]b');
		expect(joinedMarkup(['#emph[a]', '[b]'])).toBe('#emph[a]\\[b\\]');
		expect(joinedMarkup(['#name', 'b'])).toBe('#name\\b');
		expect((await faceIn('#let w(n) = {emph(n); "(b)"}', '#w("q")'))?.dom.textContent).toBe('q(b)');
	});

	it('prints values as Typst prints them: numbers added, literals by their value, the `;` after an expression gone', async () => {
		const file = [
			'#let f(x) = [Value: #x]',
			'#let g(x, y) = {x + y}',
			'#let w(n) = n + 1',
			'#let m(n) = {let k = n + 1; k}',
			'#let s(x) = [#set text(red); #x]',
			'#let t(n) = [#n;x]',
			'#let p(x) = [#x]'
		].join('\n');
		const drawn = async (chip: string) => (await faceIn(file, chip))?.dom.textContent?.trim();
		expect(await drawn('#g(1, 2)')).toBe('3');
		expect(await drawn('#w(2)')).toBe('3');
		expect(await drawn('#m(1.5)')).toBe('2.5');
		expect(await drawn('#g(-1, 2)')).not.toBe('−12');
		const values = ['0xff', '1.50', '1e3', 'auto', '1.50pt', '10mm'].map((v) => drawn(`#f(${v})`));
		expect(await Promise.all(values)).toEqual(['Value: 255', 'Value: 1.5', 'Value: 1000', 'Value: auto', 'Value: 1.5pt', 'Value: 28.35pt']);
		const listed = await faceIn(file, '#p("1. hi")');
		expect(listed?.dom.textContent).toBe('1. hi');
		expect(listed?.dom.querySelector('[data-list-kind]')).toBeNull();
		expect(await drawn('#s[hi]')).toBe('hi');
		expect(await drawn('#t("q")')).toBe('qx');
	});

	it('reads a name the file assigns after its let as unknown', async () => {
		const file = '#let flag = false\n#{ flag = true }\n#let f() = if flag [yes] else [no]';
		expect((await faceIn(file, '#f()'))?.dom.textContent).not.toBe('no');
	});
});
