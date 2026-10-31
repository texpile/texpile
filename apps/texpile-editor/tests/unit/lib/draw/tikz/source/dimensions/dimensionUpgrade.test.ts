import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../../engines/lualatexEngine';
import { readDimension } from '$lib/draw/tikz/source/dimensions/dimensionStatements';
import { upgradeDimensions } from '$lib/draw/tikz/source/dimensions/dimensionUpgrade';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';

// as the editor wrote them before node widths ran across the box and lengths were measured on the paper
const EARLIER_STYLE = 'dimension/.style={thin, gray, >=latex, every node/.style={fill=white, inner sep=1pt, font=\\footnotesize}}';
const VALUE = (e: string) => `\\pgfmathparse{${e}}\\pgfmathprintnumber[fixed,precision=2]{\\pgfmathresult}`;
const EARLIER =
	`\\begin{tikzpicture}[scale=2, ${EARLIER_STYLE}]\n` +
	'  \\node[draw, ellipse, minimum width=4cm, minimum height=2cm] (n1) at (0,3) {};\n' +
	'  \\draw (0,0) coordinate (D1) -- (1.5,0) coordinate (D2) -- (1.5,1) coordinate (D3);\n' +
	`  \\draw[dimension] let \\p1 = ($(n1.south east)-(n1.south west)$) in (n1.south west) -- ($(n1.south west)+(0,-0.6cm)$) (n1.south east) -- ($(n1.south east |- n1.south west)+(0,-0.6cm)$) ($(n1.south west)+(0,-0.5cm)$) edge[<->] node {${VALUE('(abs(\\x1)-0.4)/28.45274')}} ($(n1.south east |- n1.south west)+(0,-0.5cm)$);\n` +
	`  \\draw[dimension] let \\p1 = ($(D2)-(D1)$) in (D1) -- ($(D1)!0.6cm!90:(D2)$) (D2) -- ($(D2)!0.6cm!-90:(D1)$) ($(D1)!0.5cm!90:(D2)$) edge[<->] node[sloped] {${VALUE('veclen(\\x1,\\y1)/28.45274')}} ($(D2)!0.5cm!-90:(D1)$);\n` +
	`  \\draw[dimension] let \\p1 = ($(D3)-(D2)$) in (D2) -- ($(D2)+(0.6cm,0)$) (D3) -- ($(D3 -| D2)+(0.6cm,0)$) ($(D2)+(0.5cm,0)$) edge[<->] node {${VALUE('abs(\\y1)/28.45274')}} ($(D3 -| D2)+(0.5cm,0)$);\n` +
	'\\end{tikzpicture}';

describe('dimensions an earlier version wrote', () => {
	it('are written again as dimensions this version reads, and left alone once they are', () => {
		const now = upgradeDimensions(EARLIER);
		const picture = readPicture(now)!;
		expect(picture.statements.slice(2).map((st) => readDimension(now, picture, st)?.kind)).toEqual(['node', 'aligned', 'y']);
		expect(now).toContain('n1.south -| n1.west');
		expect(upgradeDimensions(now)).toBe(now);
	});

	useLualatex();
	it.skipIf(!hasLualatex)('print their lengths on the paper', async () => {
		// each value TeX prints, told as an error so it can be read back; `scale` leaves a node's size as it is
		const told = upgradeDimensions(EARLIER).replace(
			/\\pgfmathprintnumber\[[^\]]*\]\{\\pgfmathresult\}/g,
			'\\errmessage{printed \\pgfmathresult}'
		);
		const doc = `\\documentclass{article}\n\\begin{document}\n${told}\n\\end{document}\n`;
		const result = await drawWithLualatex(
			'\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc,shapes.geometric}',
			instrumentPicture(doc, readPicture(doc)!)
		);
		const printed = result.errors.map((e) => Number(/printed (-?\d*\.?\d+)/.exec(e)?.[1]));
		expect(printed.map((v) => Math.round(v * 10) / 10)).toEqual([4, 3, 2]);
	});
});
