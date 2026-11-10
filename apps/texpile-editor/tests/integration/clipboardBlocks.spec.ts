import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string) => `\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const figure =
	'\\begin{figure}[h]\n\\centering\n\\includegraphics[width=3cm]{plot.png}\n\\caption{Caption words}\n\\label{fig:one}\n\\end{figure}';

const files = {
	'all.tex': doc(
		`Intro $x^2$.\n\n${figure}\n\n\\begin{equation}\n\\label{eq:a}\nE = mc^2\n\\end{equation}\n\n\\begin{thebibliography}{9}\n\\bibitem{knuth} D. Knuth.\n\\end{thebibliography}`
	)
};
const texpile = useTexpile({ files });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const withPicture = () => fs.writeFileSync(path.join(texpile().root, 'plot.png'), PIXEL);
const visual = () => new VisualEditor(texpile().page, texpile().root);
const disk = () => new Disk(texpile().root);

test('select all, copy and paste back over itself leaves the file as it was', async () => {
	withPicture();
	const v = visual();
	await v.open('all.tex');
	const original = disk().read('all.tex');
	await v.evalView('view.focus(); return 1;');
	await v.press('ControlOrMeta+a');
	await v.press('ControlOrMeta+c');
	await v.press('ControlOrMeta+v');
	await disk().expectUnchanged('all.tex', original, 2500);
});
