// The workspace watcher's main-process end. The watching itself (fsWatch.ts) runs in the helper
// process; this keeps the key -> root table, relays its change events, and re-arms the watches
// if that process has to be forked again.
import { helperCall, onHelperEvent, onHelperRefork } from '../helper/helperProcess';

const active = new Map<string, { root: string; onChange: () => void }>();

onHelperEvent((e) => {
	if (e.event === 'fs-changed') active.get(e.key)?.onChange();
});
onHelperRefork(() => {
	for (const [key, w] of active) void helperCall('watch.start', [key, w.root]).catch(() => {});
});

/** watch `root` under `key`, calling `onChange` (debounced there) on any relevant change */
export function startWorkspaceWatch(key: string, root: string, onChange: () => void): void {
	active.set(key, { root, onChange });
	void helperCall('watch.start', [key, root]).catch((e) => console.error('fsWatch:', root, e));
}

export function stopWorkspaceWatch(key: string): void {
	if (!active.delete(key)) return;
	void helperCall('watch.stop', [key]).catch(() => {});
}
