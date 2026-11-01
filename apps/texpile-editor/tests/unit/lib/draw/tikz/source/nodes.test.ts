import { expect, it } from 'vitest';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';

const CLOUD = '\\begin{tikzpicture}\n  \\node[draw, cloud, cloud puffs=10, aspect=2, minimum width=3cm] at (0,0) {};\n\\end{tikzpicture}\n';
const node = (text: string) => lang.readPicture(text, 0)!.statements[0];

it('a library outline reads as none of the Shape field, and a shape picked for it replaces its keys', () => {
	expect(lang.readNodeBox(CLOUD, node(CLOUD))?.shape).toBeNull();
	const box = lang.writeNodeBox(CLOUD, node(CLOUD), { shape: 'rectangle' })!;
	expect(box).toContain('\\node[draw, minimum width=3cm] at (0,0) {};');
	const wider = lang.writeNodeBox(CLOUD, node(CLOUD), { w: 4 })!;
	expect(wider).toContain('\\node[draw, cloud, cloud puffs=10, aspect=2, minimum width=4cm] at (0,0) {};');
});
