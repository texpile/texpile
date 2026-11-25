// a 2d context that records each draw call with the state it drew in (no transform: the painter draws in block space)
export type RecordedDraw = {
	readonly call: 'fillRect' | 'fillText' | 'clearRect' | 'stroke' | 'fill';
	readonly args: readonly unknown[];
	readonly fillStyle: string;
	readonly font: string;
};

export function recordingContext(): { context: CanvasRenderingContext2D; draws: RecordedDraw[] } {
	const draws: RecordedDraw[] = [];
	const state: Record<string, unknown> = { fillStyle: '#000000', font: '10px sans-serif', globalAlpha: 1 };
	const stack: Record<string, unknown>[] = [];
	const recorded = new Set(['fillRect', 'fillText', 'clearRect', 'stroke', 'fill']);
	const context = new Proxy({} as CanvasRenderingContext2D, {
		get(_target, key) {
			if (typeof key !== 'string') return undefined;
			if (key === 'save') return () => stack.push({ ...state });
			if (key === 'restore') return () => Object.assign(state, stack.pop());
			if (recorded.has(key))
				return (...args: unknown[]) =>
					draws.push({ call: key as RecordedDraw['call'], args, fillStyle: String(state.fillStyle), font: String(state.font) });
			if (key in state) return state[key];
			return () => undefined;
		},
		set(_target, key, value) {
			if (typeof key === 'string') state[key] = value;
			return true;
		}
	});
	return { context, draws };
}
