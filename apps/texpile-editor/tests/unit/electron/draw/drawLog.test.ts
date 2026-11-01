import { describe, expect, it } from 'vitest';
import { logErrors } from '../../../../../../electron/src/draw/drawLog';

// as LuaTeX logs the walker failing inside \directlua, broken at 79 columns
const LOG = [
	'\\drawrun=\\count288',
	'(./work/picture.tex)/tmp/claude-0/vfdebug/lua/tikzcap.lua:190: attempt to index',
	" a nil value (local 'boom')",
	'stack traceback:',
	"\t/tmp/claude-0/vfdebug/lua/tikzcap.lua:190: in upvalue 'virtualGlyph'"
].join('\n');

describe('logErrors', () => {
	it('joins an error TeX broke at 79 bytes where its lines end in CRLF, and reads its bytes as UTF-8', () => {
		const first = `! Missing \u00c3\u00a9 ${'x'.repeat(79 - 13)}`;
		expect(first).toHaveLength(79);
		const [error] = logErrors(`${first}\r\nrest of it.\r\n! Emergency stop.\r\n`);
		expect(error.message).toBe(`Missing \u00e9 ${'x'.repeat(79 - 13)}rest of it.`);
		expect(logErrors(`${first}\r\nrest of it.\r\n! Emergency stop.\r\n`)).toHaveLength(1);
	});

	it('reports the walker failing, which LuaTeX logs without "! "', () => {
		expect(logErrors(LOG)).toEqual([
			{ message: "The figure could not be read from TeX: attempt to index a nil value (local 'boom')", line: null }
		]);
	});
});
