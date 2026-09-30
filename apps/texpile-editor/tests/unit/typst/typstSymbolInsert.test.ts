// @vitest-environment jsdom
// What the symbol picker writes into Typst source: where the caret is (read off the real Typst
// parser), and how a symbol is spelled there. `|` marks the caret, before and after.
import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { computeTypstSymbolInsert, typstInsertContextAt, typstSymbolSourceText } from '$lib/languages/typst/symbols/typstSymbolInsert';
import { typstSymbolByName } from '$lib/languages/typst/symbols/typstSymbols';
import type { TypstSymbol } from '$lib/languages/typst/symbols/typstSymbol.types';

function stateAt(withCarets: string): EditorState {
	const doc = withCarets.replaceAll('|', '');
	const carets: number[] = [];
	for (let i = 0, shift = 0; i < withCarets.length; i++) if (withCarets[i] === '|') carets.push(i - shift++);
	const state = EditorState.create({
		doc,
		selection: EditorSelection.create(carets.map((at) => EditorSelection.cursor(at))),
		extensions: [typstLanguage(), EditorState.allowMultipleSelections.of(true)]
	});
	ensureSyntaxTree(state, doc.length, 5000);
	return state;
}

function symbol(name: string): TypstSymbol {
	const found = typstSymbolByName(name);
	if (!found) throw new Error(`no symbol ${name}`);
	return found;
}

/** the document after inserting `name` at every caret, carets marked */
function insert(withCarets: string, name: string): string {
	const state = stateAt(withCarets);
	const next = state.update(computeTypstSymbolInsert(state, symbol(name))).state;
	const text = next.doc.toString();
	return next.selection.ranges.map((r) => r.head).reduceRight((out, head) => out.slice(0, head) + '|' + out.slice(head), text);
}

function contextOf(withCaret: string) {
	const state = stateAt(withCaret);
	return typstInsertContextAt(state, state.selection.main.head);
}

describe('where the caret is', () => {
	it('is markup in running text, headings and list items', () => {
		expect(contextOf('Some |text')).toBe('markup');
		expect(contextOf('= Head|ing')).toBe('markup');
		expect(contextOf('- item|')).toBe('markup');
		expect(contextOf('#f[bo|dy]')).toBe('markup');
	});

	it('is math between the dollars, and not just outside them', () => {
		expect(contextOf('$ a | $')).toBe('math');
		expect(contextOf('$|$')).toBe('math');
		expect(contextOf('$a|$')).toBe('math');
		expect(contextOf('$a$|')).toBe('markup');
		expect(contextOf('|$a$')).toBe('markup');
	});

	it('follows a call: code in markup, math in an equation', () => {
		expect(contextOf('#f(|)')).toBe('code');
		expect(contextOf('#f(a, |)')).toBe('code');
		expect(contextOf('$ vec(|) $')).toBe('math');
		expect(contextOf('$ vec(1, |) $')).toBe('math');
	});

	it('is code in a code block, and markup again in content inside math', () => {
		expect(contextOf('#{ let x = 1; | }')).toBe('code');
		expect(contextOf('$ #box[|] $')).toBe('markup');
	});

	it('is text in a string, raw text or a comment', () => {
		expect(contextOf('#let s = "a|b"')).toBe('text');
		expect(contextOf('`ra|w`')).toBe('text');
		expect(contextOf('// a comm|ent')).toBe('text');
		expect(contextOf('// a comment|')).toBe('text');
		expect(contextOf('/* a | b */')).toBe('text');
	});
});

describe('in math', () => {
	it('writes the shorthand when there is one', () => {
		expect(insert('$ x | y $', 'sym.arrow.r.double')).toBe('$ x =>| y $');
		expect(insert('$ x | y $', 'sym.eq.not')).toBe('$ x !=| y $');
	});

	it('writes the bare name when there is none', () => {
		expect(insert('$ | $', 'sym.alpha')).toBe('$ alpha| $');
		expect(insert('$ x | $', 'sym.arrow.r.long.bar')).toBe('$ x arrow.r.long.bar| $');
	});

	it('writes the name where the shorthand would run into a neighbor', () => {
		expect(insert('$ a <| $', 'sym.arrow.r')).toBe('$ a <arrow.r| $');
		expect(insert('$ a |- b $', 'sym.arrow.l')).toBe('$ a arrow.l|- b $');
	});

	it('keeps a name apart from a letter, a digit, a dot or a paren', () => {
		expect(insert('$x|$', 'sym.alpha')).toBe('$x alpha|$');
		expect(insert('$|x$', 'sym.alpha')).toBe('$alpha |x$');
		expect(insert('$|(x)$', 'sym.alpha')).toBe('$alpha |(x)$');
	});

	it('lets a subscript attach', () => {
		expect(insert('$|_1$', 'sym.alpha')).toBe('$alpha|_1$');
	});

	it('reaches an emoji as code, since math does not have the module in scope', () => {
		expect(insert('$ | $', 'emoji.face.grin')).toBe('$ #emoji.face.grin| $');
	});

	it('keeps an emoji name from running into a subscript or a bracket', () => {
		expect(insert('$ |_x $', 'emoji.face.grin')).toBe('$ #emoji.face.grin |_x $');
		expect(insert('$ |[x] $', 'emoji.face.grin')).toBe('$ #emoji.face.grin |[x] $');
	});
});

describe('in markup', () => {
	it('writes the character itself', () => {
		expect(insert('a | b', 'sym.arrow.r.double')).toBe('a ⇒| b');
		expect(insert('|', 'sym.alpha')).toBe('α|');
	});

	it('writes the markup shorthand when there is one', () => {
		expect(insert('pages 1|9', 'sym.dash.en')).toBe('pages 1--|9');
		expect(insert('a|b', 'sym.dash.em')).toBe('a---|b');
		expect(insert('Mr.| Smith', 'sym.space.nobreak')).toBe('Mr.~| Smith');
	});

	it('writes the character where the shorthand would run into a neighbor', () => {
		expect(insert('a-|b', 'sym.dash.en')).toBe('a-–|b');
		expect(insert('so.|', 'sym.dots.h')).toBe('so.…|');
	});

	it('names a character that would not show, ending the name before text', () => {
		expect(insert('a| b', 'sym.space.thin')).toBe('a#sym.space.thin| b');
		expect(insert('a|b', 'sym.space.thin')).toBe('a#sym.space.thin;|b');
		expect(insert('a|(b)', 'sym.zws')).toBe('a#sym.zws;|(b)');
	});

	it('names the soft hyphen where its shorthand would fuse', () => {
		expect(insert('co|op', 'sym.hyph.soft')).toBe('co-?|op');
		expect(insert('co-|op', 'sym.hyph.soft')).toBe('co-#sym.hyph.soft;|op');
	});

	it('escapes a character markup reads as syntax', () => {
		expect(insert('costs | 5', 'sym.dollar')).toBe('costs \\$| 5');
		expect(insert('a |b', 'sym.underscore')).toBe('a \\_|b');
		expect(insert('mail |me', 'sym.at')).toBe('mail \\@|me');
		expect(insert('a | b', 'sym.backslash')).toBe('a \\\\| b');
		expect(insert('a | b', 'sym.tilde.basic')).toBe('a \\~| b');
	});

	it('ends an embedded expression the symbol would run on from', () => {
		expect(insert('#x|', 'sym.alpha')).toBe('#x;α|');
		expect(insert('#sym.alpha|', 'sym.beta')).toBe('#sym.alpha;β|');
		expect(insert('a #x|', 'sym.paren.l')).toBe('a #x;(|');
		expect(insert('#x |', 'sym.alpha')).toBe('#x α|');
		expect(insert('*#x|*', 'sym.alpha')).toBe('*#x;α|*');
	});
});

describe('in code and in text', () => {
	it('writes the full name in code', () => {
		expect(insert('#let x = (|)', 'sym.arrow.r')).toBe('#let x = (sym.arrow.r|)');
		expect(insert('#f(|)', 'emoji.face.grin')).toBe('#f(emoji.face.grin|)');
	});

	it('parts a name from a minus after it', () => {
		expect(insert('#{ let y = |-1 }', 'sym.pi')).toBe('#{ let y = sym.pi |-1 }');
	});

	it('writes the character in a string, raw text or a comment', () => {
		expect(insert('#let s = "a|b"', 'sym.arrow.r')).toBe('#let s = "a→|b"');
		expect(insert('// see |', 'sym.arrow.r')).toBe('// see →|');
		expect(insert('`|`', 'sym.alpha')).toBe('`α|`');
	});

	it('escapes a quote or a backslash in a string, and only there', () => {
		expect(insert('#let s = "a|b"', 'sym.quote.double')).toBe('#let s = "a\\"|b"');
		expect(insert('#let s = "a|b"', 'sym.backslash')).toBe('#let s = "a\\\\|b"');
		expect(insert('`a|b`', 'sym.quote.double')).toBe('`a"|b`');
	});
});

it('writes each caret its own spelling', () => {
	expect(insert('$ | $ then |', 'sym.arrow.r.double')).toBe('$ =>| $ then ⇒|');
});

it('replaces a selection', () => {
	const state = EditorState.create({ doc: 'a xyz b', selection: { anchor: 2, head: 5 }, extensions: [typstLanguage()] });
	ensureSyntaxTree(state, 7, 5000);
	expect(state.update(computeTypstSymbolInsert(state, symbol('sym.alpha'))).state.doc.toString()).toBe('a α b');
});

it('previews what the main caret would get', () => {
	expect(typstSymbolSourceText(stateAt('$ x | $'), symbol('sym.arrow.r'))).toBe('->');
	expect(typstSymbolSourceText(stateAt('x |'), symbol('sym.arrow.r'))).toBe('→');
});
