import { it, expect } from 'vitest';
import { diskEdits, type MergeEdit } from '$lib/files/sync/diskMerge';

function applied(text: string, edits: MergeEdit[]): string {
	let out = text;
	for (const e of [...edits].reverse()) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
	return out;
}

// what another program wrote goes in as edits to the words that changed: an edit that covered more would move the
// caret and the comments anchored to the untouched words between two changes
it('turns a write to several places into edits inside the lines that changed', () => {
	const memory = ['first line of the text', 'a second line that stays', 'the third line here', 'and the last one'].join('\n');
	const disk = [
		'first line of the new text',
		'a second line that stays',
		'the third line here',
		'and the last one',
		'with a line after it'
	].join('\n');
	const edits = diskEdits(memory, disk);
	expect(applied(memory, edits)).toBe(disk);
	expect(edits.length).toBe(2);
	expect(edits[0].insert.trim()).toBe('new');
	expect(edits[0].to).toBeLessThan(memory.indexOf('\n'));
	expect(edits[1].from).toBeGreaterThanOrEqual(memory.indexOf('and the last one'));
	expect(diskEdits(memory, memory)).toEqual([]);
});
