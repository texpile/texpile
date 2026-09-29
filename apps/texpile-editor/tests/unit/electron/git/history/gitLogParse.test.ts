// The timeline is only as good as these two parsers: one reads the version list, the other reads
// what differs between a version and the working copy. Both are fed streams that real repos
// produce and naive splitting mangles - a subject that is not the last field, a rename that prints
// two paths on one line.
import { describe, it, expect } from 'vitest';
import { parseFileNames, parseGitLog, parseNameStatus } from '../../../../../../../electron/src/git/history/gitHistory';

// NUL between records and US between fields, because neither can appear in a subject or a name
const REC = '\x00';
const FIELD = '\x1f';

/** builds the stream `git log --format=...%s` produces */
function stream(commits: { hash: string; short: string; author: string; date: string; subject: string; parents?: string }[]): string {
	return commits
		.map((c) => `${REC}${c.hash}${FIELD}${c.short}${FIELD}${c.author}${FIELD}${c.date}${FIELD}${c.parents ?? 'p1'}${FIELD}${c.subject}\n`)
		.join('');
}

const one = {
	hash: 'a'.repeat(40),
	short: 'aaaaaaa',
	author: 'Ada Lovelace',
	date: '2026-08-25T10:00:00+01:00',
	subject: 'Rewrote the results section'
};

describe('parseGitLog', () => {
	it('reads a version', () => {
		const [e] = parseGitLog(stream([one]));
		expect(e).toEqual({ ...one, parentCount: 1 });
	});

	// the timeline draws one straight lane, which is only the truth while every version has one
	// parent. A merge is where that lane is a simplification, so it has to be visible.
	it('counts the versions a merge was made from', () => {
		const [e] = parseGitLog(stream([{ ...one, parents: 'aaa111 bbb222' }]));
		expect(e.parentCount).toBe(2);
	});

	it('calls a root commit parentless rather than counting an empty field as one', () => {
		const [e] = parseGitLog(stream([{ ...one, parents: '' }]));
		expect(e.parentCount).toBe(0);
	});

	it('keeps versions in the order git emitted them', () => {
		const second = { ...one, hash: 'b'.repeat(40), short: 'bbbbbbb', subject: 'Added the ablation table' };
		expect(parseGitLog(stream([one, second])).map((e) => e.subject)).toEqual([one.subject, second.subject]);
	});

	// the subject is last precisely so this is lossless, but a subject that ever carried a US must
	// come back whole rather than truncated at it
	it('keeps a subject containing the field separator intact', () => {
		const [e] = parseGitLog(stream([{ ...one, subject: `Fig${FIELD}5 redrawn` }]));
		expect(e.subject).toBe(`Fig${FIELD}5 redrawn`);
	});

	// what Copy message copies: the whole message, not only the line the row shows
	it('keeps the rest of a message apart from its first line, and adds nothing without one', () => {
		const [e] = parseGitLog(
			stream([{ ...one, subject: `Rewrote the results\x1eThe ablation moved to the appendix.\n\nPer the committee.\n` }])
		);
		expect(e.subject).toBe('Rewrote the results');
		expect(e.body).toBe('The ablation moved to the appendix.\n\nPer the committee.');
		expect(parseGitLog(stream([{ ...one, subject: 'One line\x1e\n' }]))[0]).not.toHaveProperty('body');
	});

	it('survives an empty log and trailing blank lines', () => {
		expect(parseGitLog('')).toEqual([]);
		expect(parseGitLog('\n\n')).toEqual([]);
		expect(parseGitLog(stream([one]) + '\n\n')).toHaveLength(1);
	});

	it('skips a record with no hash instead of emitting a blank row', () => {
		expect(parseGitLog(`${REC}${FIELD}${FIELD}${FIELD}${FIELD}orphan\n`)).toEqual([]);
	});
});

describe('parseNameStatus', () => {
	// `--name-status -z`: every field ends with NUL, and names are never quoted
	it('reads a letter and a path each', () => {
		expect(parseNameStatus('M\0paper/main.tex\0A\0paper/refs.bib\0D\0paper/old.tex\0')).toEqual([
			{ path: 'paper/main.tex', status: 'M' },
			{ path: 'paper/refs.bib', status: 'A' },
			{ path: 'paper/old.tex', status: 'D' }
		]);
	});

	// a rename prints old then new; opening the old path would open nothing
	it('takes the destination of a rename, not its source', () => {
		expect(parseNameStatus('R096\0paper/intro.tex\0paper/introduction.tex\0')).toEqual([
			{ path: 'paper/introduction.tex', status: 'R', from: 'paper/intro.tex' }
		]);
	});

	// a copy did not exist before, so it reads as an add; a typechange is a modification
	it('folds git’s rarer letters onto the four the panel can colour', () => {
		expect(parseNameStatus('C100\0a.tex\0b.tex\0T\0link.tex\0')).toEqual([
			{ path: 'b.tex', status: 'A' },
			{ path: 'link.tex', status: 'M' }
		]);
	});

	// without -z git printed this one as "Notes on \"Hamlet\".tex", quotes and all, naming no file
	it('keeps a name with quotes, a backslash or a tab in it exactly as it is', () => {
		expect(parseNameStatus('M\0Notes on "Hamlet".tex\0A\0a\\b\tc.tex\0')).toEqual([
			{ path: 'Notes on "Hamlet".tex', status: 'M' },
			{ path: 'a\\b\tc.tex', status: 'A' }
		]);
	});

	it('survives empty output', () => {
		expect(parseNameStatus('')).toEqual([]);
	});
});

describe('parseFileNames', () => {
	it("reads each version's name for the file, unquoted, and skips a version that lists none", () => {
		// what `git log -z --format=%x01%H --name-only` prints: a merge lists no name
		const raw = `\x01${'a'.repeat(40)}\0\n章.tex\0\0\x01${'m'.repeat(40)}\0\x01${'b'.repeat(40)}\0\nold name.tex\0`;
		expect(parseFileNames(raw)).toEqual(
			new Map([
				['a'.repeat(40), '章.tex'],
				['b'.repeat(40), 'old name.tex']
			])
		);
	});
});
