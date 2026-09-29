// The client half of electron/src/git/gitTrust.ts: a repository git will not work in because another
// account on this computer owns its folder, trusted once the author says so.
import { NO_BRIDGE, errMsg, type GitOpResult } from './git';
import { nativeBridge } from '../fileSystem';

export type GitTrustResult = GitOpResult & { path?: string };

export type GitTrustBridge = {
	gitTrustRepo?: (root: string) => Promise<GitTrustResult>;
};

export function canTrustRepo(): boolean {
	return !!nativeBridge()?.gitTrustRepo;
}

export async function gitTrustRepo(root: string): Promise<GitTrustResult> {
	const n = nativeBridge();
	if (!n?.gitTrustRepo) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitTrustRepo(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}
