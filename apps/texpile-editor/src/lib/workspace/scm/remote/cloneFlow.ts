// Clone from the start screen, the File menu or the palette: the dialog, the clone behind it, and
// opening the folder it made. Where it goes is remembered for next time, per machine.
import { askClone } from '../gitDialogs.svelte';
import { gitClone, cancelClone, type GitCloneResult } from './gitClone';
import { dirname, joinPath, pickFolder } from '../../fileSystem';
import { recentFolders } from '../../workspaceStore';
import { toastGitFailure } from '../gitFailureToast';
import { sshReason } from '../../uploadReason';
import { m } from '$lib/paraglide/messages';

const LAST_PARENT = 'texpile:cloneParent';

/** where the last clone went; failing that, beside the folder opened last */
function suggestedParent(): string | null {
	try {
		const last = localStorage.getItem(LAST_PARENT);
		if (last) return last;
	} catch {
		// storage blocked: fall through to the guess
	}
	const recent = recentFolders.current[0];
	return recent ? dirname(recent) : null;
}

function rememberParent(parent: string): void {
	try {
		localStorage.setItem(LAST_PARENT, parent);
	} catch {
		// a convenience; nothing depends on it
	}
}

/** git's most specific line ("fatal: fig.png: smudge filter lfs failed"), without its prefix */
function gitReasonLine(output: string): string {
	const line = output.split('\n').find((l) => /^(fatal|error):/.test(l.trim())) ?? output.split('\n')[0] ?? '';
	return line.trim().replace(/^(fatal|error):\s*/, '');
}

/** what to tell the author, or '' when there is nothing to say (they stopped it) */
export function cloneReason(res: GitCloneResult): string {
	if (res.reason === 'no-git') return m.vcs_git_missing();
	switch (res.failure) {
		case 'cancelled':
			return '';
		case 'exists':
			return m.vcs_clone_exists({ path: res.path ?? '' });
		case 'not-found':
			return m.vcs_clone_not_found();
		case 'auth':
			return sshReason(res.error) ?? m.vcs_clone_auth();
		case 'network':
			return m.vcs_clone_network();
		case 'invalid':
			return m.vcs_clone_invalid();
		case 'checkout':
			return m.vcs_clone_checkout({ reason: gitReasonLine(res.error ?? '') });
		default:
			return res.error || m.vcs_clone_failed();
	}
}

/** ask what to clone, clone it, and hand the new folder to `open` */
export async function startClone(open: (path: string) => unknown): Promise<void> {
	const choice = await askClone({
		parent: suggestedParent(),
		pickParent: () => pickFolder(),
		stop: cancelClone,
		submit: async (c, onStep) => {
			const res = await gitClone(c.url, c.parent, c.name, onStep);
			if (!res.ok) return cloneReason(res);
			rememberParent(c.parent);
			// the project arrived, a folder it takes from another repository did not: opened all the same
			if (res.submodules) toastGitFailure(m.vcs_clone_submodules_title(), m.vcs_clone_submodules(), { error: res.submodules });
			return null;
		}
	});
	if (choice) await open(joinPath(choice.parent, choice.name));
}
