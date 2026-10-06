import { describe, it, expect } from 'vitest';
import { spliceDiff } from '$lib/collab/spliceDiff';

function charByChar(a: string, b: string) {
	if (a === b) return null;
	let s = 0;
	const m = Math.min(a.length, b.length);
	while (s < m && a[s] === b[s]) s++;
	let ea = a.length;
	let eb = b.length;
	while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
		ea--;
		eb--;
	}
	return { index: s, remove: ea - s, insert: b.slice(s, eb) };
}

describe('spliceDiff', () => {
	it('finds the same splice as a char by char scan, at slice edges and in repeated text', () => {
		const unit = 'Velocity is the rate of change of position. \\section{Motion}\n';
		const text = unit.repeat(200);
		let seed = 7;
		const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
		const at = [0, 1, 1023, 1024, 1025, 2048, text.length - 1025, text.length - 1024, text.length - 1, text.length];
		for (let i = 0; i < 300; i++) at.push(rand(text.length));
		for (const p of at) {
			for (const next of [
				text.slice(0, p) + 'x' + text.slice(p),
				text.slice(0, p) + text.slice(p + 3),
				text.slice(0, p) + unit + text.slice(p),
				text.slice(0, p) + 'abc' + text.slice(p + 2)
			]) {
				expect(spliceDiff(text, next)).toEqual(charByChar(text, next));
			}
		}
	});
});
