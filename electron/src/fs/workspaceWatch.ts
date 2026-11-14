// The workspace watcher's main-thread end. The watching itself (fsWatch.ts) runs in the helper
// thread; this keeps the key -> root table, relays its change events, and re-arms the watches
// if that thread has to be started again.
import { helperCall, onHelperEvent, onHelperRestart } from '../helper/helperThread';
import type { RawFileChange } from './coalesceChanges';

const active = new Map<string, { root: string; onChange: (changes: RawFileChange[]) => void }>();

onHelperEvent((e) => {
	if (e.event === 'fs-changed') active.get(e.key)?.onChange(e.data as RawFileChange[]);
});
onHelperRestart(() => {
	for (const [key, w] of active) void helperCall('watch.start', [key, w.root]).catch(() => {});
});

/** watch `root` under `key`, calling `onChange` with each coalesced batch */
export function startWorkspaceWatch(key: string, root: string, onChange: (changes: RawFileChange[]) => void): void {
	active.set(key, { root, onChange });
	void helperCall('watch.start', [key, root]).catch((e) => console.error('fsWatch:', root, e));
}

export function stopWorkspaceWatch(key: string): void {
	if (!active.delete(key)) return;
	void helperCall('watch.stop', [key]).catch(() => {});
}
