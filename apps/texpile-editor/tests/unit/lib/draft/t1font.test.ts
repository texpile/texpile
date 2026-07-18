// Needs a TeX Live install (skipped otherwise). Oracle bboxes come from LuaTeX's own
// fontloader over the same files (probe: integraltext [56,-1111,609,0] font units).
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { parseT1, parseEncVector } from '../../../../src/lib/draft/type1/t1font';

const PFB = 'c:/texlive/2025/texmf-dist/fonts/type1/public/lm/lmex10.pfb';
const ENC = 'c:/texlive/2025/texmf-dist/fonts/enc/dvips/lm/lm-mathex.enc';
const CMEX = 'c:/texlive/2025/texmf-dist/fonts/type1/public/amsfonts/cm/cmex10.pfb';
const TEXT_PFB = 'c:/texlive/2025/texmf-dist/fonts/type1/public/lm/lmr10.pfb';
const TEXT_ENC = 'c:/texlive/2025/texmf-dist/fonts/enc/dvips/lm/lm-ec.enc';
const have = fs.existsSync(PFB) && fs.existsSync(ENC);

describe.skipIf(!have)('t1font', () => {
	it('renders lmex10 operators at their true geometry', () => {
		const font = parseT1(new Uint8Array(fs.readFileSync(PFB)), fs.readFileSync(ENC, 'utf8'));
		expect(font).not.toBeNull();
		// slot 82 = \int (integraltext); size 1000px on a 0.001 matrix = font units
		const p = font!.pathForSlot(82, 0, 0, 1000)!;
		expect(p).not.toBeNull();
		const b = p.getBoundingBox();
		expect(b.x1).toBeCloseTo(56, 0);
		expect(b.x2).toBeCloseTo(609, 0);
		expect(b.y1).toBeCloseTo(0, 0);
		expect(b.y2).toBeCloseTo(1111, 0);
		// display-size and assembly glyphs exist too (the twin approach could not draw these)
		expect(font!.pathForSlot(90, 0, 0, 1000)).not.toBeNull(); // integraldisplay
		expect(font!.pathForSlot(48, 0, 0, 1000)).not.toBeNull(); // bracelefttp
	});

	it.skipIf(!fs.existsSync(CMEX))('renders cmex10 via its BUILT-IN encoding (classic cm fonts ship no .enc)', () => {
		// the \int-dropped bug's parse layer: pdftex.map gives cmex10 no reencoding, so
		// slot -> name must come from the font's own /Encoding, never Standard
		const font = parseT1(new Uint8Array(fs.readFileSync(CMEX)), null);
		expect(font).not.toBeNull();
		expect(font!.pathForSlot(82, 0, 0, 1000)).not.toBeNull(); // integraltext
		expect(font!.pathForSlot(90, 0, 0, 1000)).not.toBeNull(); // integraldisplay
	});

	it('renders text glyphs and maps them for word extraction', () => {
		const font = parseT1(new Uint8Array(fs.readFileSync(TEXT_PFB)), fs.readFileSync(TEXT_ENC, 'utf8'));
		expect(font).not.toBeNull();
		expect(font!.pathForSlot(97, 0, 0, 1000)).not.toBeNull(); // 'a'
		expect(font!.textMap[97]).toBe(0x61);
		// T1 slot 0xE9 = eacute (a seac-composed accent glyph in many Type1 fonts)
		const names = parseEncVector(fs.readFileSync(TEXT_ENC, 'utf8'))!;
		const ea = names.indexOf('eacute');
		if (ea >= 0) expect(font!.pathForSlot(ea, 0, 0, 1000)).not.toBeNull();
	});
});
