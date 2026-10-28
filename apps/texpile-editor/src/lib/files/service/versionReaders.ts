import type { URI } from 'vscode-uri';
import { gitShowAt, type GitShowResult } from '$lib/workspace/scm/git';
import { gitFileAt } from '$lib/workspace/scm/gitVersion';
import { readLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { readBefore } from '$lib/ai/agentPanel/changes/agentBefore';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { m } from '$lib/paraglide/messages';
import { AGENT_REF } from '../identity/versionUris';

function found(content: string | null): GitShowResult {
	return content === null ? { ok: false, hasHead: false, error: m.history_entry_gone() } : { ok: true, hasHead: true, content };
}

/** the text of any version a version URI names */
export async function readVersion(uri: URI, path: string): Promise<GitShowResult> {
	if (uri.scheme === 'agent') return found(readBefore(AGENT_REF + uri.query));
	if (uri.scheme === 'history') return found(await readLocalHistory(path, uri.query));
	const { ref, path: renamed } = JSON.parse(uri.query) as { ref: string; path?: string };
	const root = workspaceRoot.current;
	return renamed && root ? gitFileAt(root, renamed, ref) : gitShowAt(path, ref);
}
