import { describe, it, expect } from 'vitest';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const wrap = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])('a name JavaScript objects have: %s', (name) => {
	it.each([
		['in a sentence', `Words \\${name}{x} more.`],
		['as a block', `\\${name}{x}\n\nNext.`],
		['as an environment', `\\begin{${name}}\nBody.\n\\end{${name}}`]
	])('opens and saves %s', (_where, body) => {
		const parsed = parseLatexFile(wrap(body));
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(wrap(body));
	});
});
