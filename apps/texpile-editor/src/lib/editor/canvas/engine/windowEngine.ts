// the window's engine (D34): one per window, so its caches are shared by every view in it
import type { CanvasEngine } from '../contracts/engineTypes';
import { createCanvasEngine } from './canvasEngine';

const engines = new WeakMap<Window, CanvasEngine>();

export function windowEngine(win: Window): CanvasEngine {
	let engine = engines.get(win);
	if (!engine) engines.set(win, (engine = createCanvasEngine(win as Window & typeof globalThis)));
	return engine;
}
