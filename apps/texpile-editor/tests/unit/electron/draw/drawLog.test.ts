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
	it('reports the walker failing, which LuaTeX logs without "! "', () => {
		expect(logErrors(LOG)).toEqual([
			{ message: "The figure could not be read from TeX: attempt to index a nil value (local 'boom')", line: null }
		]);
	});
});
