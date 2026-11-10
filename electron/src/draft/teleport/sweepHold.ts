// A compile under way writes seeds and engine folders that only its index will name: the live preview leaves _draft
// alone until the compile lands.
import { normRoot } from '../../windows/normRoot';

const holds = new Map<string, number>();

/** returns the release, which may be called more than once */
export function holdSweep(root: string): () => void {
	const key = normRoot(root);
	holds.set(key, (holds.get(key) ?? 0) + 1);
	let held = true;
	return () => {
		if (!held) return;
		held = false;
		const left = (holds.get(key) ?? 1) - 1;
		if (left > 0) holds.set(key, left);
		else holds.delete(key);
	};
}

export function sweepHeld(root: string): boolean {
	return holds.has(normRoot(root));
}
