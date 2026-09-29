// client half of electron/src/fs/resolveRealRelative.ts
import { nativeBridge } from './fileSystem';

/** where `rel` really lands under root (short names and case resolved), or null when outside it or unreadable */
export async function resolveRealRelative(root: string, rel: string): Promise<string | null> {
	try {
		return (await nativeBridge()?.fsRealRelative(root, rel)) ?? null;
	} catch {
		return null;
	}
}
