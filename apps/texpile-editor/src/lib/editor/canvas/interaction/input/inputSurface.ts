// the input surface by feature (4.10): EditContext on the root where the engine has it, the textarea elsewhere
import type { InputSink, InputSurface } from '../../contracts/inputTypes';
import { canvasSupport, type CanvasSupport } from '../../engine/canvasSupport';
import { createEditContextSurface } from './editContextSurface';
import { createTextareaSurface } from './textareaSurface';

export function createInputSurface(root: HTMLElement, sink: InputSink, support?: Pick<CanvasSupport, 'editContext'>): InputSurface {
	const win = root.ownerDocument.defaultView as Window & typeof globalThis;
	return (support ?? canvasSupport(win)).editContext ? createEditContextSurface(root, sink) : createTextareaSurface(root, sink);
}
