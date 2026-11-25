import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FaceElement, faceElement, faceText, provideFaceRects, watchFaceMutations } from '$lib/editor/canvas/tree/faceElement';

const UNIT = path.resolve(__dirname, '../../../..');
const FACE_TESTS = ['lib/languages', 'lib/editor/visual/extensions/drawnChips', 'typst'];
// receivers whose .dom is a real view's DOM, not a face's
const VIEW_RECEIVERS = new Set(['view', 'v', 'cm', 'editor', 'editorView', 'pm']);

function testFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const at = path.join(dir, name);
		if (statSync(at).isDirectory()) return testFiles(at);
		return name.endsWith('.test.ts') ? [at] : [];
	});
}

// compile-time samples: svelte-check fails when a ts-expect-error below stops being an error
function pushesPastInsertBefore(el: FaceElement): void {
	// @ts-expect-error a push skips the reparent and the version bump that marks the block dirty
	el.childNodes.push(faceText('x'));
	// @ts-expect-error children is a filtered copy, so a push would be lost
	el.children.push(faceElement('b'));
}

/** every member the face tests read off face.dom or off what face.dom.querySelector found */
function membersFaceTestsCall(): Set<string> {
	const members = new Set<string>();
	for (const file of FACE_TESTS.flatMap((dir) => testFiles(path.join(UNIT, dir)))) {
		const source = readFileSync(file, 'utf8');
		for (const [, receiver, member] of source.matchAll(/\b(\w+)(?:\(\))?[?!]?\.dom[?!]?\.(\w+)/g))
			if (!VIEW_RECEIVERS.has(receiver)) members.add(member);
		if (!/\.dom\b/.test(source)) continue;
		for (const [, name] of source.matchAll(/(?:const|let) (\w+) = [^;\n]*\b(?!view\b)\w+[?!]?\.dom[?!]?;/g))
			for (const [, member] of source.matchAll(new RegExp(`\\b${name}[?!]?\\.(\\w+)`, 'g'))) members.add(member);
		for (const [, member] of source.matchAll(/\.querySelector(?:All)?(?:<[^>]*>)?\([^)]*\)[?!]?(?:\[\d+\])?[?!]?\.(\w+)/g))
			members.add(member);
	}
	return members;
}

function chip(): FaceElement {
	const root = faceElement('span', 'drawn-chip drawn-parts', 'see ');
	const ref = root.appendChild(faceElement('a', 'drawn-ref'));
	ref.setAttribute('data-tip', 'Section 2');
	ref.dataset.itemLabel = '(a)';
	ref.append('2', faceElement('sup', '', '*'));
	root.style.setProperty('--change-hue', '210');
	root.style.width = '2em';
	return root;
}

describe('FaceElement', () => {
	it('has every DOM member the face tests call', () => {
		const members = membersFaceTestsCall();
		expect(members.size).toBeGreaterThan(8);
		// what a press or a Svelte component did in the DOM editor; faces get FaceElement.on and overlays (8.4)
		const handledElsewhere = new Set(['click', 'dispatchEvent', 'scrollIntoView', 'length']);
		const missing = [...members].filter((m) => !handledElsewhere.has(m) && !(m in chip()));
		expect(missing).toEqual([]);
	});

	it('answers textContent, tagName, className and classList as the DOM does', () => {
		const root = chip();
		expect(root.textContent).toBe('see 2*');
		expect(root.tagName).toBe('SPAN');
		expect(root.nodeName).toBe('SPAN');
		expect(root.className).toBe('drawn-chip drawn-parts');
		root.classList.add('drawn-chip-face');
		root.classList.remove('drawn-parts');
		expect(root.classList.contains('drawn-chip-face')).toBe(true);
		expect(root.className).toBe('drawn-chip drawn-chip-face');
		expect(root.classList.toggle('drawn-chip-face')).toBe(false);
	});

	it('reads children, firstChild, getAttribute, dataset and closest', () => {
		const root = chip();
		const ref = root.querySelector('.drawn-ref')!;
		expect(root.firstChild?.textContent).toBe('see ');
		expect([...root.children].map((c) => c.className)).toEqual(['drawn-ref']);
		expect(ref.getAttribute('data-tip')).toBe('Section 2');
		expect(ref.getAttribute('data-item-label')).toBe('(a)');
		expect(ref.dataset.tip).toBe('Section 2');
		expect(ref.dataset.missing).toBeUndefined();
		expect(ref.querySelector('sup')!.closest('.drawn-chip')).toBe(root);
		expect(root.querySelectorAll('a, sup').map((el) => el.tagName)).toEqual(['A', 'SUP']);
	});

	it('reads style properties by camelCase name, custom properties and cssText', () => {
		const root = chip();
		expect(root.style.width).toBe('2em');
		expect(root.style.getPropertyValue('--change-hue')).toBe('210');
		expect(root.style.border).toBe('');
		root.style.gridColumn = '1 / 3';
		expect(root.getAttribute('style')).toBe('--change-hue: 210; width: 2em; grid-column: 1 / 3;');
		root.setAttribute('style', 'color: red; background: url("a;b")');
		expect(root.style.color).toBe('red');
		expect(root.style.background).toBe('url("a;b")');
	});

	it('serializes innerHTML and outerHTML with escaped text', () => {
		const root = faceElement('div', 'x');
		root.append('a < b & c', faceElement('br'));
		expect(root.innerHTML).toBe('a &lt; b &amp; c<br>');
		expect(chip().outerHTML).toBe(
			'<span class="drawn-chip drawn-parts" style="--change-hue: 210; width: 2em;">see <a class="drawn-ref" data-tip="Section 2" data-item-label="(a)">2<sup>*</sup></a></span>'
		);
	});

	it('folds attribute names to lower case on HTML elements only', () => {
		const svg = new FaceElement('svg', 'http://www.w3.org/2000/svg');
		svg.setAttribute('viewBox', '0 0 9 6');
		expect(svg.getAttribute('viewbox')).toBeNull();
		expect(svg.outerHTML).toBe('<svg viewBox="0 0 9 6"></svg>');
		const div = faceElement('div');
		div.setAttribute('Data-Tip', 'x');
		expect(div.getAttribute('data-tip')).toBe('x');
		expect(div.outerHTML).toBe('<div data-tip="x"></div>');
	});

	it('moves a node it adopts and empties a fragment it receives', () => {
		const a = faceElement('p');
		const b = faceElement('p');
		const text = faceText('moved');
		a.appendChild(text);
		b.appendChild(text);
		expect(a.childNodes).toEqual([]);
		expect(text.parentNode).toBe(b);
		const fragment = new FaceElement('', null, true);
		fragment.append('x', faceElement('em'));
		a.appendChild(fragment);
		expect(a.innerHTML).toBe('x<em></em>');
		expect(fragment.childNodes).toEqual([]);
	});

	it('keeps childNodes read-only and live', () => {
		const el = faceElement('p');
		const childNodes = el.childNodes;
		el.append('x', faceElement('b'));
		expect(childNodes.map((c) => c.nodeName)).toEqual(['#text', 'B']);
		expect(pushesPastInsertBefore).toBeTypeOf('function');
	});

	it('bumps its version on a mutation and tells the block watcher', () => {
		const root = chip();
		const sup = root.querySelector('sup')!;
		const seen: FaceElement[] = [];
		const stop = watchFaceMutations(root, (el) => seen.push(el));
		const before = sup.version;
		sup.textContent = '†';
		sup.style.color = 'red';
		stop();
		const watched = seen.length;
		sup.classList.add('late');
		expect(sup.version).toBeGreaterThan(before);
		expect(new Set(seen)).toEqual(new Set([sup]));
		expect(seen.length).toBe(watched);
	});

	it('answers getBoundingClientRect from the layout, or an empty rect before it', () => {
		const root = chip();
		const ref = root.querySelector('a')!;
		expect(ref.getBoundingClientRect().width).toBe(0);
		provideFaceRects(root, (el) => (el === ref ? ({ x: 4, y: 5, width: 30, height: 18 } as DOMRect) : null));
		expect(ref.getBoundingClientRect().width).toBe(30);
		provideFaceRects(root, null);
	});
});
