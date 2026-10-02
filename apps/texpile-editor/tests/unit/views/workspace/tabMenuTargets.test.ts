import { it, expect } from 'vitest';
import { relativeTo, tabsToClose } from '../../../../src/views/workspace/tabMenuTargets';

const a = { path: 'C:\\p\\a.tex' };
const b = { path: 'C:\\p\\b.tex' };
const c = { path: 'C:\\p\\c.tex' };
const bCompare = { path: 'C:\\p\\b.tex', compare: { hash: 'h1', subject: 'v1' } };
const tabs = [a, b, bCompare, c];

it('takes the right tabs for each scope, the focused one last', () => {
	expect(tabsToClose('others', tabs, b, c, false)).toEqual([a, bCompare, c]);
	expect(tabsToClose('right', tabs, b, c, false)).toEqual([bCompare, c]);
	expect(tabsToClose('all', tabs, b, a, false)).toEqual([b, bCompare, c, a]);
});

it('keeps a focused file with unsaved edits out of Close Saved, comparisons of it included', () => {
	expect(tabsToClose('saved', tabs, a, b, true)).toEqual([a, bCompare, c]);
	expect(tabsToClose('saved', tabs, a, b, false)).toEqual([a, bCompare, c, b]);
});

it('spells the path from the root down, and not at all for a file outside it', () => {
	expect(relativeTo('C:\\p', 'C:\\p\\sub\\a.tex')).toBe('sub\\a.tex');
	expect(relativeTo('C:\\P', 'c:\\p\\a.tex')).toBe('a.tex');
	expect(relativeTo('C:\\p', 'D:\\a.tex')).toBeNull();
	expect(relativeTo('/papers/thesis', '/papers/thesis-common/intro.tex')).toBeNull();
	expect(relativeTo('C:\\', 'C:\\a.tex')).toBe('a.tex');
	expect(relativeTo(null, 'C:\\p\\a.tex')).toBeNull();
});
