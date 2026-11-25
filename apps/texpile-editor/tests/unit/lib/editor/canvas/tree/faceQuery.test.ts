import { describe, expect, it } from 'vitest';
import { FaceElement, faceElement } from '$lib/editor/canvas/tree/faceElement';

function tree(): FaceElement {
	const root = faceElement('div', 'tex-environment theorem');
	root.setAttribute('data-env', 'theorem');
	const head = root.appendChild(faceElement('div', 'env-header'));
	const look = head.appendChild(faceElement('span', 'env-name'));
	look.setAttribute('data-look', 'theorem plain');
	look.setAttribute('role', 'math');
	const body = root.appendChild(faceElement('div', 'tex-environment-body'));
	body.hole = true;
	const p = body.appendChild(faceElement('p', '', 'Text'));
	p.id = 'first';
	return root;
}

function tags(found: FaceElement[]): string[] {
	return found.map((el) => el.className || el.tagName);
}

describe('faceQuery', () => {
	it('matches type, class, id and attribute selectors', () => {
		const root = tree();
		expect(tags(root.querySelectorAll('span'))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll('.env-header'))).toEqual(['env-header']);
		expect(tags(root.querySelectorAll('#first'))).toEqual(['P']);
		expect(tags(root.querySelectorAll('[role="math"]'))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll('[data-look~=plain]'))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll("[data-look^='theo']"))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll('[data-look$=plain]'))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll('[data-look*="em p"]'))).toEqual(['env-name']);
		expect(tags(root.querySelectorAll('[data-look]'))).toEqual(['env-name']);
		expect(root.querySelectorAll('[data-look=plain]')).toEqual([]);
	});

	it('matches attribute names case-sensitively on SVG elements', () => {
		const root = faceElement('div');
		root.setAttribute('data-env', 'figure');
		root.appendChild(new FaceElement('svg', 'http://www.w3.org/2000/svg')).setAttribute('viewBox', '0 0 9 6');
		expect(tags(root.querySelectorAll('[viewBox]'))).toEqual(['svg']);
		expect(root.querySelectorAll('[viewbox]')).toEqual([]);
		expect(root.matches('[DATA-ENV=figure]')).toBe(true);
	});

	it('follows descendant and child combinators inside the face tree only', () => {
		const root = tree();
		expect(tags(root.querySelectorAll('.tex-environment p'))).toEqual(['P']);
		expect(tags(root.querySelectorAll('.tex-environment > .env-header > [data-look]'))).toEqual(['env-name']);
		expect(root.querySelectorAll('.tex-environment > p')).toEqual([]);
		expect(root.querySelector('.tex-environment-body p')?.textContent).toBe('Text');
		expect(root.matches('div.tex-environment.theorem[data-env=theorem]')).toBe(true);
	});

	it('takes :not() and comma lists, in document order', () => {
		const root = tree();
		expect(tags(root.querySelectorAll('div:not(.env-header)'))).toEqual(['tex-environment-body']);
		expect(tags(root.querySelectorAll('p, .env-header'))).toEqual(['env-header', 'P']);
		expect(root.querySelector('p')!.closest('.tex-environment:not(.lemma)')).toBe(root);
	});

	it('refuses selectors outside the subset instead of answering wrongly', () => {
		expect(() => tree().querySelector('p:first-child')).toThrow(/unsupported selector/);
		expect(() => tree().querySelector('p + p')).toThrow(/unsupported selector/);
	});
});
