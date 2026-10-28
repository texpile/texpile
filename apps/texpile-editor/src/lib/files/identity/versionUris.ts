import { URI } from 'vscode-uri';
import { fileUriOf } from './fileUris';

/** a compare tab's ref as tabs keep it: a commit hash, a Local History copy or an agent turn's before */
export type VersionRef = { hash: string; path?: string };

export type VersionScheme = 'git' | 'history' | 'agent';

export const LOCAL_REF = 'local:';
export const AGENT_REF = 'agent:';

export function versionSchemeOf(ref: VersionRef): VersionScheme {
	if (ref.hash.startsWith(AGENT_REF)) return 'agent';
	return ref.hash.startsWith(LOCAL_REF) ? 'history' : 'git';
}

/** `git:` carries the commit and the name the file had then, `history:` the copy, `agent:` the turn */
export function versionUriOf(path: string, ref: VersionRef): URI {
	const file = fileUriOf(path).path;
	const scheme = versionSchemeOf(ref);
	if (scheme === 'agent') return URI.from({ scheme, path: file, query: ref.hash.slice(AGENT_REF.length) });
	if (scheme === 'history') return URI.from({ scheme, path: file, query: ref.hash.slice(LOCAL_REF.length) });
	return URI.from({ scheme, path: file, query: JSON.stringify({ ref: ref.hash, path: ref.path }) });
}
