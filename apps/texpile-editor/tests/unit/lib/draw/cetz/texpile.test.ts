import { expect, it } from 'vitest';
import { withTexpile } from '$lib/draw/cetz/texpile';

const imports = (s: string) => s.match(/^#import "@preview\/cetz:[^\n]*/gm);

it('the texpile block imports CeTZ only when the document does not name it cetz, at its version', () => {
	expect(imports(withTexpile('#import "@preview/cetz:0.4.2"\n\n#cetz.canvas({})\n'))).toEqual(['#import "@preview/cetz:0.4.2"']);
	expect(imports(withTexpile('#import "@preview/cetz:0.3.4": canvas, draw\n\n#canvas({})\n'))).toEqual([
		'#import "@preview/cetz:0.3.4": canvas, draw',
		'#import "@preview/cetz:0.3.4"'
	]);
});
