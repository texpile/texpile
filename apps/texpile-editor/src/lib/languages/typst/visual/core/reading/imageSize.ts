// the file an image call shows and the width and height it gives
import { typstLengthCss } from '../../extensions/css/typstLengthCss';
import { namedArg, type TypstCall } from './typstCall';

export type ImageDrawing = { path: string; width: string | null; height: string | null };

export function sizeOf(call: TypstCall | null, name: string): string | null {
	const arg = call ? namedArg(call, name) : null;
	return arg && call ? typstLengthCss(arg.node, call.source) : null;
}
