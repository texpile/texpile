// the placeholder words #lorem prints: the standard text, started again when it runs out
const TEXT =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const WORDS = TEXT.split(' ');

// a paragraph that long is no more to read than this
const MOST_WORDS = 400;

export function loremText(count: number): string {
	const words = Array.from({ length: Math.min(count, MOST_WORDS) }, (_, i) => WORDS[i % WORDS.length]);
	if (!words.length) return '';
	return words.join(' ').replace(/[,.;:]$/, '') + '.';
}
