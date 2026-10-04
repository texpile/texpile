import { describe, it, expect } from 'vitest';
import { compareSuggestions, type EditMode, type PlacedSuggestion, type TypingSide } from '$lib/comments/suggestCompare';
import { carryGestures } from '$lib/comments/editGestures';

function run(before: string, after: string, pending: PlacedSuggestion[], mode: EditMode = 'editing', sides?: Record<string, TypingSide>) {
	let n = 0;
	return compareSuggestions({ before, after, pending, mode, author: 'me', newId: () => `n${++n}`, sides });
}

function on(text: string, words: string, restore: string, author = 'mei', id = 's1'): PlacedSuggestion {
	const from = text.indexOf(words);
	return { id, from, to: from + words.length, restore, author };
}

function point(text: string, before: string, restore: string, author = 'mei', id = 's1'): PlacedSuggestion {
	const at = text.indexOf(before);
	return { id, from: at, to: at, restore, author };
}

const shown = (text: string, r: ReturnType<typeof run>) => r.placed.map((s) => [s.id, text.slice(s.from, s.to), s.restore, s.author]);

describe('an edit meeting a suggestion', () => {
	const T = 'It is sharp and cheap for smooth data.';
	const S = on(T, 'sharp and cheap', 'reliable');

	it.each([
		[
			'editing outside leaves it alone',
			T,
			'It was sharp and cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp and cheap', 'reliable', 'mei']],
			[]
		],
		[
			'editing at its edge leaves it alone',
			T,
			'It is sharp and cheapest for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp and cheap', 'reliable', 'mei']],
			[]
		],
		[
			'deleting some new words shrinks it',
			T,
			'It is sharp for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp ', 'reliable', 'mei']],
			['revise:s1']
		],
		[
			'typing inside is more of it',
			T,
			'It is sharp and very cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp and very cheap', 'reliable', 'mei']],
			['revise:s1']
		],
		[
			'replacing part of it keeps the new text in it',
			T,
			'It is sharp or cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp or cheap', 'reliable', 'mei']],
			['revise:s1']
		],
		[
			'typing just before it leaves it alone',
			T,
			'It is very sharp and cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp and cheap', 'reliable', 'mei']],
			[]
		],
		[
			'an edit across one edge takes only what it covers',
			T,
			'It rp and cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'rp and cheap', 'reliable', 'mei']],
			['revise:s1']
		],
		['an edit across the whole of it closes it', T, 'It data.', [S], 'editing', [], ['close:s1']],
		[
			'deleting exactly the new words of a Replace leaves the Delete',
			T,
			'It is  for smooth data.',
			[S],
			'editing',
			[['s1', '', 'reliable', 'mei']],
			['revise:s1']
		],
		[
			'deleting exactly the new words of an Add withdraws it',
			T,
			'It is  for smooth data.',
			[on(T, 'sharp and cheap', '')],
			'editing',
			[],
			['withdraw:s1']
		],
		['replacing the whole of it closes it', T, 'It is fine for smooth data.', [S], 'editing', [], ['close:s1']],
		['a Delete inside a deletion closes', T, 'It for smooth data.', [point(T, 'sharp', 'very ')], 'editing', [], ['close:s1']],

		[
			'suggesting away from any suggestion makes one',
			'the cat sat',
			'the dog sat',
			[],
			'suggesting',
			[['n1', 'dog', 'cat', 'me']],
			['open:n1']
		],
		[
			'letters put inside a word are added on their own',
			'you can click it',
			'you can cliaack it',
			[],
			'suggesting',
			[['n1', 'aa', '', 'me']],
			['open:n1']
		],
		[
			'letters taken out of a word go on their own too',
			'the cats sat',
			'the cat sat',
			[],
			'suggesting',
			[['n1', '', 's', 'me']],
			['open:n1']
		],
		[
			'a word swapped for another takes whole words',
			'you can click it',
			'you can clack it',
			[],
			'suggesting',
			[['n1', 'clack', 'click', 'me']],
			['open:n1']
		],
		[
			'a space put inside a word takes the whole word',
			'you can click it',
			'you can cli ck it',
			[],
			'suggesting',
			[['n1', 'cli ck', 'click', 'me']],
			['open:n1']
		],
		[
			'a phrase typed over is one suggestion',
			'it beats all baselines here',
			'it beats the uniform baseline here',
			[],
			'suggesting',
			[['n1', 'the uniform baseline', 'all baselines', 'me']],
			['open:n1']
		],
		[
			'suggesting against your own joins it',
			'the dog sat',
			'the doggy sat',
			[on('the dog sat', 'dog', 'cat', 'me')],
			'suggesting',
			[['s1', 'doggy', 'cat', 'me']],
			['revise:s1']
		],
		[
			"typing inside someone else's splits theirs around yours",
			T,
			'It is sharp and very cheap for smooth data.',
			[S],
			'suggesting',
			[
				['s1', 'sharp and ', 'reliable', 'mei'],
				['n1', 'very ', '', 'me'],
				['n2', 'cheap', '', 'mei']
			],
			['revise:s1', 'open:n1', 'open:n2']
		],
		[
			"deleting some of someone else's new words shrinks theirs",
			T,
			'It is sharp cheap for smooth data.',
			[S],
			'suggesting',
			[['s1', 'sharp cheap', 'reliable', 'mei']],
			['revise:s1']
		],
		[
			"replacing the whole of someone else's absorbs it",
			T,
			'It is fine for smooth data.',
			[S],
			'suggesting',
			[['n1', 'fine', 'reliable', 'me']],
			['open:n1', 'close:s1']
		],
		[
			"an edit across the edge of someone else's shrinks theirs and suggests the rest",
			T,
			'It rp and cheap for smooth data.',
			[S],
			'suggesting',
			[
				['n1', '', 'is ', 'me'],
				['s1', 'rp and cheap', 'reliable', 'mei']
			],
			['open:n1', 'revise:s1']
		],
		[
			'putting the old words back withdraws it',
			'the dog sat',
			'the cat sat',
			[on('the dog sat', 'dog', 'cat', 'me')],
			'suggesting',
			[],
			['withdraw:s1']
		],
		[
			'whitespace alone changes nothing',
			T,
			'It is sharp\nand cheap for smooth data.',
			[S],
			'editing',
			[['s1', 'sharp\nand cheap', 'reliable', 'mei']],
			['revise:s1']
		]
	] as const)('%s', (_name, before, after, pending, mode, placed, changes) => {
		const r = run(before, after, [...pending], mode);
		expect(shown(after, r)).toEqual(placed);
		expect(r.changes.map((c) => `${c.t}:${c.id}`)).toEqual(changes);
	});

	it.each([
		[
			'in front of your own Delete, its words stay behind the typing',
			'It is sharp.',
			'It is really sharp.',
			point('It is sharp.', 'sharp', 'very ', 'me'),
			'suggesting',
			'before',
			[
				['n1', 'really ', '', 'me'],
				['s1', '', 'very ', 'me']
			]
		],
		[
			'behind your own Delete, the typing joins it into one replacement',
			'It is sharp.',
			'It is really sharp.',
			point('It is sharp.', 'sharp', 'very ', 'me'),
			'suggesting',
			'after',
			[['s1', 'really ', 'very ', 'me']]
		],
		[
			'in front of your own Replace, the typing is a suggestion of its own',
			T,
			'It is very sharp and cheap for smooth data.',
			on(T, 'sharp and cheap', 'reliable', 'me'),
			'suggesting',
			'before',
			[
				['n1', 'very ', '', 'me'],
				['s1', 'sharp and cheap', 'reliable', 'me']
			]
		],
		[
			"between someone else's old words and new words, theirs splits around the typing",
			T,
			'It is very sharp and cheap for smooth data.',
			S,
			'suggesting',
			'after',
			[
				['s1', '', 'reliable', 'mei'],
				['n2', 'very ', '', 'me'],
				['n1', 'sharp and cheap', '', 'mei']
			]
		],
		[
			'editing between old words and new words splits them the same way',
			T,
			'It is very sharp and cheap for smooth data.',
			S,
			'editing',
			'after',
			[
				['s1', '', 'reliable', 'mei'],
				['n1', 'sharp and cheap', '', 'mei']
			]
		]
	] as const)('typing with the caret %s', (_name, before, after, pending, mode, side, placed) => {
		expect(shown(after, run(before, after, [pending], mode, { s1: side }))).toEqual(placed);
	});

	it('suggests a paragraph break made or taken away, and with exact whitespace every space', () => {
		const suggest = (before: string, after: string, whitespace?: 'exact') =>
			compareSuggestions({ before, after, pending: [], mode: 'suggesting', author: 'me', newId: () => 'n', whitespace }).placed.map((s) => [
				after.slice(s.from, s.to),
				s.restore
			]);
		expect(suggest('It ends here.\n\nThe next one.', 'It ends here. The next one.')).toEqual([[' ', '\n\n']]);
		expect(suggest('It ends here. The next one.', 'It ends here.\n\nThe next one.')).toEqual([['\n\n', ' ']]);
		expect(suggest('a line\nwrapped', 'a line wrapped')).toEqual([]);
		expect(suggest('a line\nwrapped', 'a line wrapped', 'exact')).toEqual([[' ', '\n']]);
		expect(suggest('two words', 'two  words', 'exact')).toEqual([[' ', '']]);
	});

	// in markdown and typst the spaces before a list marker are how deep the item sits
	it('suggests an item moved in or out a level, over the whole item', () => {
		const suggest = (before: string, after: string, whitespace: 'lists' | 'paragraphs' = 'lists') =>
			compareSuggestions({ before, after, pending: [], mode: 'suggesting', author: 'me', newId: () => 'n', whitespace }).placed.map((s) => [
				after.slice(s.from, s.to),
				s.restore
			]);
		expect(suggest('- one\n- two words\n', '- one\n  - two words\n')).toEqual([['  - two words', '- two words']]);
		expect(suggest('+ one\n  + two\n', '+ one\n+ two\n')).toEqual([['+ two', '  + two']]);
		expect(suggest('- a line\n  wrapped\n', '- a line wrapped\n')).toEqual([]);
		// latex has no such rule: an item's indent there is layout
		expect(suggest('- one\n- two\n', '- one\n  - two\n', 'paragraphs')).toEqual([]);
	});

	// the indent of a paragraph after a list says whether it is the item's second paragraph
	it('suggests a paragraph moved into or out of the item before it', () => {
		const suggest = (before: string, after: string) =>
			compareSuggestions({
				before,
				after,
				pending: [],
				mode: 'suggesting',
				author: 'me',
				newId: () => 'n',
				whitespace: 'lists'
			}).placed.map((s) => [after.slice(s.from, s.to), s.restore]);
		expect(suggest('- first\n\n  more of it\n\nAfter.\n', '- first\n\nmore of it\n\nAfter.\n')).toEqual([['more of it', '  more of it']]);
		expect(suggest('- first\n\nA paragraph.\n\nAfter.\n', '- first\n\n  A paragraph.\n\nAfter.\n')).toEqual([
			['  A paragraph.', 'A paragraph.']
		]);
		// with no list before it the indent is layout
		expect(suggest('First.\n\nSecond one.\n', 'First.\n\n  Second one.\n')).toEqual([]);
	});

	it('suggests spaces typed in a code block, where they are its content', () => {
		const suggest = (before: string, after: string, whitespace: 'lists' | 'paragraphs') =>
			compareSuggestions({ before, after, pending: [], mode: 'suggesting', author: 'me', newId: () => 'n', whitespace }).placed.map((s) => [
				after.slice(s.from, s.to),
				s.restore
			]);
		expect(suggest('Intro.\n\n```py\nif x:\nrun()\n```\n', 'Intro.\n\n```py\nif x:\n    run()\n```\n', 'lists')).toEqual([['    ', '']]);
		expect(
			suggest(
				'Intro.\n\n\\begin{verbatim}\nif x:\nrun()\n\\end{verbatim}\n',
				'Intro.\n\n\\begin{verbatim}\nif x:\n    run()\n\\end{verbatim}\n',
				'paragraphs'
			)
		).toEqual([['    ', '']]);
		// after the block, spaces are layout again
		expect(suggest('```\nx\n```\n\nA line\nwrapped.\n', '```\nx\n```\n\nA line wrapped.\n', 'lists')).toEqual([]);
	});

	it('suggests a markdown line break of two spaces taken out or put in', () => {
		const suggest = (before: string, after: string, whitespace: 'markdown' | 'lists' = 'markdown') =>
			compareSuggestions({
				before,
				after,
				pending: [],
				mode: 'suggesting',
				author: 'me',
				newId: () => 'n',
				whitespace
			}).placed.map((s) => [after.slice(s.from, s.to), s.restore]);
		expect(suggest('A verse  \nand the next.\n', 'A verse\nand the next.\n')).toEqual([['', '  ']]);
		expect(suggest('A verse\nand the next.\n', 'A verse  \nand the next.\n')).toEqual([['  ', '']]);
		// before a blank line the spaces break nothing
		expect(suggest('A verse  \n\nNext one.\n', 'A verse\n\nNext one.\n')).toEqual([]);
		// typst has no such break: the spaces there are layout
		expect(suggest('A verse  \nand the next.\n', 'A verse\nand the next.\n', 'lists')).toEqual([]);
	});

	it('keeps a paragraph break that is half a suggestion’s new words afterwards', () => {
		const before = 'Aa.\n\n\\x{b t}\n\\x{he c}\n\nr.';
		const after = '\\\n\nr';
		const theirs = on(before, 't}\n\\x{he', 'the', 'me', 'p');
		let n = 0;
		const r = compareSuggestions({ before, after, pending: [theirs], mode: 'suggesting', author: 'mei', newId: () => `n${++n}` });
		let rejected = after;
		for (const s of [...r.placed].reverse()) rejected = rejected.slice(0, s.from) + s.restore + rejected.slice(s.to);
		expect(rejected.replace(/\n\n/g, '¶').replace(/\s+/g, ' ')).toBe('Aa.¶\\x{b the c}¶r.');
	});

	it('suggests a paragraph break that moved to the other side of a word', () => {
		const before = '\\section{Edge}\n\\label{sec}\n\nSpecial words.';
		const after = '\\section{Edge}\n\n\\label{sec}Special words.';
		const gestures = [{ from: after.indexOf('\n\n'), to: after.indexOf('Special') }];
		const r = compareSuggestions({ before, after, pending: [], mode: 'suggesting', author: 'me', newId: () => 'n', gestures });
		let rejected = after;
		for (const s of [...r.placed].reverse()) rejected = rejected.slice(0, s.from) + s.restore + rejected.slice(s.to);
		expect(rejected.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' '))).toEqual(['\\section{Edge} \\label{sec}', 'Special words.']);
	});

	it('joins the words one edit typed over, and keeps a separate edit separate', () => {
		const before = 'where a coarse grid resolves it and the old mesh too';
		const after = 'where one coarse cell resolves it and the new mesh too';
		const typed = { from: after.indexOf('one'), to: after.indexOf('cell') + 'cell'.length };
		let n = 0;
		const compare = (gestures: { from: number; to: number }[]) =>
			compareSuggestions({ before, after, pending: [], mode: 'suggesting', author: 'me', newId: () => `n${++n}`, gestures }).placed.map(
				(s) => s.restore
			);
		expect(compare([typed])).toEqual(['a coarse grid', 'old']);
		expect(compare([])).toEqual(['a', 'grid', 'old']);
	});

	it('reads an edit right before a suggestion as outside it, even where the text repeats', () => {
		const text = 'x the cat y';
		const theirs = on(text, 'the cat', 'a dog');
		expect(shown('x the the cat y', run(text, 'x the the cat y', [theirs]))).toEqual([['s1', 'the cat', 'a dog', 'mei']]);
		const deleted = run('x the the cat y', 'x the cat y', [on('x the the cat y', 'the cat', 'a dog')], 'suggesting');
		expect(shown('x the cat y', deleted)).toEqual([
			['n1', '', 'the ', 'me'],
			['s1', 'the cat', 'a dog', 'mei']
		]);
	});

	it('never splits a character that takes two code units', () => {
		const r = run('ok 😀 go', 'ok 😃 go', [], 'suggesting');
		expect(r.placed.map((s) => ['ok 😃 go'.slice(s.from, s.to), s.restore])).toEqual([['😃', '😀']]);
	});

	it('keeps suggestions a big replace-all does not touch', () => {
		const line = 'a coarse grid resolves it.\n';
		const before = line.repeat(1500);
		const after = before.replaceAll('grid', 'mesh');
		const pending = Array.from({ length: 100 }, (_, i) => {
			const at = i * 15 * line.length + 'a coarse'.length;
			return { id: `p${i}`, from: at, to: at, restore: ' very', author: 'mei' };
		});
		const r = run(before, after, pending);
		expect(r.changes.filter((c) => c.t === 'close')).toEqual([]);
		expect(r.placed).toHaveLength(100);
	});

	it('diffs a command like any other text: the name changes, the backslash before it stays', () => {
		const text = 'Text.\n\n\\clearpage\n\n\\appendix\n';
		const renamed = 'Text.\n\n\\newpage\n\n\\appendix\n';
		const kind = run(text, renamed, [], 'suggesting');
		expect(kind.placed.map((s) => [s.restore, renamed.slice(s.from, s.to)])).toEqual([['clearpage', 'newpage']]);
		const gone = 'Text.\n\n\\appendix\n';
		const removed = run(text, gone, [], 'suggesting');
		expect(removed.placed.map((s) => [s.restore, gone.slice(s.from, s.to)])).toEqual([['clearpage\n\n\\', '']]);
		const added = run(gone, text, [], 'suggesting');
		expect(added.placed.map((s) => [s.restore, text.slice(s.from, s.to)])).toEqual([['', 'clearpage\n\n\\']]);
	});

	it('leaves a group swap as the word changes it is made of', () => {
		const before = 'Some {\\it words} and {\\bf bold words}, then more.';
		const after = 'Some {\\it words} and \\textbf{bold words}, then more.';
		const { placed } = run(before, after, [], 'suggesting');
		expect(placed.map((s) => [s.restore, after.slice(s.from, s.to)])).toEqual([
			['{', ''],
			['bf ', 'textbf{']
		]);
		const rejected = placed.reduceRight((t, s) => t.slice(0, s.from) + s.restore + t.slice(s.to), after);
		expect(rejected).toBe(before);
	});

	// Deletes by two people stacked at one spot: typing back your own middle one keeps the ones after it after the words
	it.each([
		['at once', ['b ']],
		['a key at a time', ['b', ' ']]
	])('puts back your own Delete from the middle of a stack in its place, typed %s', (_name, keys) => {
		const original = 'a b c d.';
		let text = 'd.';
		let placed: PlacedSuggestion[] = [
			{ id: 'a', from: 0, to: 0, restore: 'a ', author: 'mei' },
			{ id: 'b', from: 0, to: 0, restore: 'b ', author: 'me' },
			{ id: 'c', from: 0, to: 0, restore: 'c ', author: 'mei' }
		];
		let at = 0;
		for (const key of keys) {
			const after = text.slice(0, at) + key + text.slice(at);
			placed = run(text, after, placed, 'suggesting').placed;
			text = after;
			at += key.length;
		}
		expect(text).toBe('b d.');
		expect(placed.map((s) => [s.id, s.from, s.restore])).toEqual([
			['a', 0, 'a '],
			['c', 2, 'c ']
		]);
		expect(placed.reduceRight((t, s) => t.slice(0, s.from) + s.restore + t.slice(s.to), text)).toBe(original);
	});

	it('suggests by word in text with no spaces', () => {
		const r = run('我们证明了这个方法是可靠的', '我们证明了这个方法是稳定的', [], 'suggesting');
		expect(r.placed).toHaveLength(1);
		expect(r.placed[0].restore.length).toBeLessThan(6);
	});

	// grown to whole words, what was left of the two cut words read as typed: "Title" replaced by "tle"
	it('takes out exactly what a cut across lines took, however it ends in a word', () => {
		const before = '## title 1\n\nNew line text here.\n\n## Title 2\n\nAfter text.\n';
		const after = '## title 1\n\nNew tle 2\n\nAfter text.\n';
		const r = run(before, after, [], 'suggesting');
		expect(r.placed.map((s) => [after.slice(s.from, s.to), s.restore])).toEqual([['', 'line text here.\n\n## Ti']]);
	});

	it('takes back the second of two forward Deletes when it is undone', () => {
		const deleted = 'The quick own fox';
		const undone = 'The quick rown fox';
		const r = run(deleted, undone, [point(deleted, 'own', 'br', 'me')], 'suggesting');
		expect(shown(undone, r)).toEqual([['s1', '', 'b', 'me']]);
		expect(r.placed[0].from).toBe(undone.indexOf('rown'));
	});

	it('puts a Delete with the deletion it carries on, where the text repeats, and its undo back out of it', () => {
		const text = 'The quick  fox jumps';
		const cut = 'The quick  jumps';
		const deleted = run(text, cut, [point(text, ' fox', 'brown', 'me')], 'suggesting');
		expect(shown(cut, deleted)).toEqual([['s1', '', 'brown fox', 'me']]);
		const gestures = carryGestures([], cut, text);
		const undone = compareSuggestions({
			before: cut,
			after: text,
			pending: deleted.placed,
			mode: 'suggesting',
			author: 'me',
			newId: () => 'n',
			gestures
		});
		expect(shown(text, undone)).toEqual([['s1', '', 'brown', 'me']]);
	});

	it('withdraws one person’s neighboring suggestions that together change nothing', () => {
		const pending = [
			{ id: 'i', from: 0, to: 2, restore: '', author: 'me' },
			{ id: 'd', from: 2, to: 2, restore: 'ab', author: 'me' }
		];
		const r = run('ab cd', 'ab cdx', pending, 'suggesting');
		expect(shown('ab cdx', r)).toEqual([['n1', 'x', '', 'me']]);
		expect(r.changes.map((c) => `${c.t}:${c.id}`).sort()).toEqual(['open:n1', 'withdraw:d', 'withdraw:i']);
	});
});
