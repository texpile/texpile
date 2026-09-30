// A template saved as its Git remote: each use clones the newest version into a staging folder of
// ours, and the files join the project the way a saved template's do, without the clone's history.
import { basename, dirname, joinPath, samePath, scanFiles } from '$lib/workspace/fileSystem';
import { detectMainFile } from '$lib/workspace/project';
import { gitClone } from '$lib/workspace/scm/remote/gitClone';
import { cloneReason } from '$lib/workspace/scm/remote/cloneFlow';
import { m } from '$lib/paraglide/messages';
import { requireTemplatesBridge } from '../templateBridge';
import type { UserTemplate } from '../templateBridge.types';

/** the author closed the sign-in the clone asked for: stopped, not failed, so nothing is reported */
export class CloneCancelledError extends Error {}

/** github.com/owner/repo for https://github.com/owner/repo.git or git@github.com:owner/repo.git */
export function remoteLabel(url: string): string {
	return url
		.trim()
		.replace(/^[a-z+]+:\/\//i, '')
		.replace(/^[^@/]+@([^:/]+):/, '$1/')
		.replace(/^[^@/]+@/, '')
		.replace(/\.git\/?$/i, '')
		.replace(/\/$/, '');
}

/** the file to open: the one the template was saved with while the repository still has it */
export async function remoteMainFile(root: string, template: Pick<UserTemplate, 'lang' | 'mainFile'>): Promise<string | null> {
	const ext = template.lang === 'typst' ? 'typ' : 'tex';
	const { files } = await scanFiles(root, [ext]);
	const saved = joinPath(root, template.mainFile);
	return files.find((f) => samePath(f.path, saved))?.path ?? (await detectMainFile(files));
}

/** clone `template.remote` into `root`, keeping any file already there; resolves to the file to open */
export async function createFromRemote(root: string, template: UserTemplate & { remote: string }): Promise<string | null> {
	const bridge = requireTemplatesBridge();
	const dir = await bridge.stage();
	try {
		const res = await gitClone(template.remote, dirname(dir), basename(dir), undefined, { shallow: true });
		if (res.failure === 'cancelled') throw new CloneCancelledError();
		if (!res.ok) throw new Error(cloneReason(res) || m.vcs_clone_failed());
		await bridge.adopt(dir, root);
	} finally {
		// adopt removed it already; this is for a clone that failed
		void bridge.discard(dir).catch(() => {});
	}
	return remoteMainFile(root, template);
}
