// \{ must stay \{: the auto-close exception keys off an odd run of backslashes before the caret
import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { escapedAt } from '$lib/languages/latex/source/latexEscapedBrackets';

describe('escapedAt', () => {
	it('is true after one backslash and false after an escaped backslash', () => {
		expect(escapedAt(Text.of(['\\']), 1)).toBe(true);
		expect(escapedAt(Text.of(['a\\']), 2)).toBe(true);
		expect(escapedAt(Text.of(['\\\\']), 2)).toBe(false);
		expect(escapedAt(Text.of(['\\\\\\']), 3)).toBe(true);
	});

	it('is false with no backslash, at the start, and across a line break', () => {
		expect(escapedAt(Text.of(['a']), 1)).toBe(false);
		expect(escapedAt(Text.of(['']), 0)).toBe(false);
		expect(escapedAt(Text.of(['\\', '']), 2)).toBe(false);
	});
});
