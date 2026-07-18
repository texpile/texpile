import { describe, expect, it } from 'vitest';
import { parseDviLog } from '../../../../src/lib/latex-log/dvi-parser';

describe('parseDviLog (dvipdfmx/xdvipdfmx terminal output)', () => {
	it('folds >> continuations into one warning and flags fatals as errors', () => {
		const out = [
			'xdvipdfmx:warning: Could not locate a virtual/physical font for TFM "cmr10".',
			'xdvipdfmx:warning: >> This font is mapped to a physical font "cmr10.pfb".',
			'xdvipdfmx:fatal: Cannot proceed without the font...',
			'No output PDF file written.'
		].join('\n');
		const entries = parseDviLog(out);
		expect(entries.filter((e) => e.level === 'warning')).toHaveLength(1);
		expect(entries[0].message).toContain('This font is mapped');
		expect(entries.filter((e) => e.level === 'error').map((e) => e.message)).toEqual([
			'Cannot proceed without the font...',
			'No output PDF file written.'
		]);
		expect(entries.every((e) => e.source === 'dvi')).toBe(true);
	});

	it('returns nothing for a pdflatex/lualatex run', () => {
		expect(parseDviLog('This is LuaHBTeX\nOutput written on main.pdf (3 pages).')).toEqual([]);
	});
});
