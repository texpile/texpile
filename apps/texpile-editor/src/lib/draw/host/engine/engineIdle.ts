import { nativeBridge } from '$lib/workspace/fileSystem';
import { onFiguresChange, openFigureCount } from '../anchor/openFigures.svelte';

// long enough that closing one figure and opening the next keeps the preamble loaded
const IDLE_MS = 60_000;

/** the figure engine stops a while after the last figure tab closes; returns the unsubscribe */
export function stopEngineWhenIdle(): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stop = onFiguresChange(() => {
		clearTimeout(timer);
		if (openFigureCount() === 0) timer = setTimeout(() => void nativeBridge()?.drawStop?.(), IDLE_MS);
	});
	return () => {
		clearTimeout(timer);
		stop();
	};
}
