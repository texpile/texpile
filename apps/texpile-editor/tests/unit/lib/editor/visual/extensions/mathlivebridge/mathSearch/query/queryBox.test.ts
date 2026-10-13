import { describe, expect, it } from 'vitest';
import {
	deleteBy,
	moveBy,
	moveTo,
	replaceSelection,
	selectAll
} from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/query/queryBox';

const at = (text: string, head: number) => ({ text, anchor: head, head });

describe('the math search box', () => {
	it('types over a select all, as a text box does', () => {
		expect(replaceSelection(selectAll(at('a over b', 8)), 'x')).toEqual(at('x', 1));
		expect(deleteBy(selectAll(at('a over b', 8)), -1, false)).toEqual(at('', 0));
	});

	it('moves the caret, so typing goes in where it stands', () => {
		const left = moveBy(moveBy(at('a over b', 8), -1, false, false), -1, true, false);
		expect(left).toEqual(at('a over b', 2));
		expect(replaceSelection(left, 'x ')).toEqual(at('a x over b', 4));
		expect(moveBy({ text: 'a over b', anchor: 2, head: 6 }, -1, false, false)).toEqual(at('a over b', 2));
		expect(moveTo(at('a over b', 8), 0, true)).toEqual({ text: 'a over b', anchor: 8, head: 0 });
	});

	it('deletes a word at a time with Ctrl', () => {
		expect(deleteBy(at('a over b', 8), -1, true)).toEqual(at('a over ', 7));
		expect(deleteBy(at('a over b', 7), -1, true)).toEqual(at('a b', 2));
		expect(deleteBy(at('a over b', 1), 1, true)).toEqual(at('a b', 1));
	});
});
