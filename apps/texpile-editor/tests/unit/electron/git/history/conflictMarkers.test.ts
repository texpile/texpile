import { describe, it, expect } from 'vitest';
import {
	findConflicts,
	hasConflictMarkers,
	hasMarkerLines,
	firstConflictLine,
	resolveConflict,
	type ConflictChoice
} from '$lib/workspace/scm/conflictMarkers';
import { hasConflictMarkers as mainHasMarkers } from '../../../../../../../electron/src/git/history/conflictMarkers';

const TWO_SIDES = ['Intro.', '<<<<<<< HEAD', 'My line.', '=======', 'Their line.', '>>>>>>> origin/main', 'Outro.', ''].join('\n');

function settle(text: string, choice: ConflictChoice, index = 0): string {
	const block = findConflicts(text)[index];
	const slice = (a: number, b: number) => text.slice(a, b);
	return text.slice(0, block.from) + resolveConflict(slice, block, choice) + text.slice(block.to);
}

describe('finding the places a merge marked', () => {
	it('reads each side, its name, and where every marker line is', () => {
		const [b] = findConflicts(TWO_SIDES);
		const slice = (s: { from: number; to: number }) => TWO_SIDES.slice(s.from, s.to);
		expect(slice(b)).toBe('<<<<<<< HEAD\nMy line.\n=======\nTheir line.\n>>>>>>> origin/main\n');
		expect(slice(b.mine)).toBe('My line.\n');
		expect(slice(b.theirs)).toBe('Their line.\n');
		expect(b.base).toBeNull();
		expect(b.mineLabel).toBe('HEAD');
		expect(b.theirsLabel).toBe('origin/main');
		expect(slice(b.markers.open)).toBe('<<<<<<< HEAD');
		expect(slice(b.markers.divider)).toBe('=======');
		expect(slice(b.markers.close)).toBe('>>>>>>> origin/main');
		expect(b.atEnd).toBe(false);
	});

	it('reads the lines both started from, when git wrote them', () => {
		const text = '<<<<<<< HEAD\nMine.\n||||||| merged common ancestors\nBase.\n=======\nTheirs.\n>>>>>>> topic\n';
		const [b] = findConflicts(text);
		expect(text.slice(b.mine.from, b.mine.to)).toBe('Mine.\n');
		expect(text.slice(b.base!.from, b.base!.to)).toBe('Base.\n');
		expect(text.slice(b.theirs.from, b.theirs.to)).toBe('Theirs.\n');
		expect(text.slice(b.markers.base!.from, b.markers.base!.to)).toBe('||||||| merged common ancestors');
	});

	it('finds each of several places, including empty sides', () => {
		const text = `${TWO_SIDES}<<<<<<< HEAD\n=======\nOnly theirs.\n>>>>>>> origin/main\n`;
		const blocks = findConflicts(text);
		expect(blocks).toHaveLength(2);
		expect(blocks[1].mine.from).toBe(blocks[1].mine.to);
		expect(text.slice(blocks[1].theirs.from, blocks[1].theirs.to)).toBe('Only theirs.\n');
	});

	it('does not count text that only looks like a marker', () => {
		// never closed: someone typing one, or an example in prose
		expect(findConflicts('<<<<<<< HEAD\nx\n=======\ny\n')).toEqual([]);
		// eight, indented, or glued to a word
		expect(findConflicts('<<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\n')).toEqual([]);
		expect(findConflicts('  <<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\n')).toEqual([]);
		expect(findConflicts('<<<<<<<HEAD\nx\n=======\ny\n>>>>>>> b\n')).toEqual([]);
		// a >>>>>>> before any ======= closes nothing
		expect(findConflicts('<<<<<<< HEAD\nx\n>>>>>>> b\n')).toEqual([]);
		expect(hasConflictMarkers('plain text')).toBe(false);
	});

	it('starts over at a second <<<<<<< inside an unfinished place', () => {
		const text = '<<<<<<< stray\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\n';
		const [b] = findConflicts(text);
		expect(b.from).toBe(text.indexOf('<<<<<<< HEAD'));
	});

	it('keeps a CRLF file’s line endings with its lines', () => {
		const text = 'a\r\n<<<<<<< HEAD\r\nmine\r\n=======\r\ntheirs\r\n>>>>>>> b\r\nz\r\n';
		expect(settle(text, 'theirs')).toBe('a\r\ntheirs\r\nz\r\n');
	});

	it('names the line of the first place', () => {
		expect(firstConflictLine(TWO_SIDES)).toBe(2);
		expect(firstConflictLine('no places\n')).toBeNull();
	});
});

describe('settling a place', () => {
	it('keeps one side, or both in order, and drops every marker', () => {
		expect(settle(TWO_SIDES, 'mine')).toBe('Intro.\nMy line.\nOutro.\n');
		expect(settle(TWO_SIDES, 'theirs')).toBe('Intro.\nTheir line.\nOutro.\n');
		expect(settle(TWO_SIDES, 'both')).toBe('Intro.\nMy line.\nTheir line.\nOutro.\n');
	});

	it('drops the lines both started from, whichever side is kept', () => {
		const text = '<<<<<<< HEAD\nMine.\n||||||| base\nBase.\n=======\nTheirs.\n>>>>>>> topic\n';
		expect(settle(text, 'mine')).toBe('Mine.\n');
		expect(settle(text, 'both')).toBe('Mine.\nTheirs.\n');
	});

	it('does not add a line break at the end of a file that had none', () => {
		const text = 'a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b';
		expect(findConflicts(text)[0].atEnd).toBe(true);
		expect(settle(text, 'mine')).toBe('a\nx');
		expect(settle(text, 'both')).toBe('a\nx\ny');
	});

	it('leaves the other places for their own choice', () => {
		const text = `${TWO_SIDES}<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> origin/main\n`;
		const once = settle(text, 'theirs', 1);
		expect(findConflicts(once)).toHaveLength(1);
		expect(once.endsWith('Outro.\nB\n')).toBe(true);
	});
});

// the editor and Complete Merge have to agree on when a file is done
describe('marker lines left behind', () => {
	it('counts a stray marker line as Complete Merge does', () => {
		const handSettled = 'Intro.\n=======\nTheir line.\n>>>>>>> origin/main\nOutro.\n';
		expect(findConflicts(handSettled)).toHaveLength(0);
		expect(hasMarkerLines(handSettled)).toBe(true);
		expect(mainHasMarkers(handSettled)).toBe(true);
		for (const text of [TWO_SIDES, 'Plain.\r\n=======\r\n', 'No markers. ======== eight is not one.\n', '<<<<<<<< eight\n'])
			expect(hasMarkerLines(text)).toBe(mainHasMarkers(text));
	});

	// merge.conflictStyle diff3: mine kept the two-way way, the <<<<<<< line and ======= through
	// >>>>>>> deleted, leaves the base marker and the lines both started from
	it('counts the base marker of a diff3 place left behind', () => {
		const handSettled = 'Mine.\n||||||| 2c85319\nBase.\nOutro.\n';
		expect(findConflicts(handSettled)).toHaveLength(0);
		expect(hasMarkerLines(handSettled)).toBe(true);
		expect(mainHasMarkers(handSettled)).toBe(true);
	});
});
