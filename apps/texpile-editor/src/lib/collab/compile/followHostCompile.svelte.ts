// the host publishes its main file and whether it is compiling, a guest shows both
import { collabGuest } from '../guestStore.svelte';
import { collabHost } from '../hostStore.svelte';
import { mainFile } from '$lib/workspace/workspaceStore';

export type HostCompileDeps = {
	guest(): boolean;
	compiling(): boolean;
};

export function followHostCompile(deps: HostCompileDeps): void {
	$effect(() => {
		if (deps.guest() || !collabHost.active) return;
		collabHost.shareCompileState(mainFile.current, deps.compiling());
	});
	let adopted: string | null = null;
	$effect(() => {
		if (!deps.guest()) return;
		const rel = collabGuest.hostMainFile;
		const now = mainFile.current;
		if (rel) {
			// a guest's paths are the manifest's
			adopted = rel;
			if (now !== rel) mainFile.current = rel;
		} else if (adopted && now === adopted) {
			mainFile.current = null;
			adopted = null;
		}
	});
}
