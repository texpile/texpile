// What someone pastes to clone a project, made into an address git can use and a folder name.
// People copy whatever the page shows them: the repository page itself, a file on it, the
// `git clone ...` line from a README, or the SSH form, and all of them mean the same repository.

export type CloneAddress = { url: string; name: string };

const SCP_RE = /^[\w.-]+@[\w.-]+:[^\s]+$/; // git@github.com:owner/repo.git
const LOCAL_RE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;

/** the repository's own name, as a folder: the last path segment without .git */
function nameOf(path: string): string {
	const last =
		path
			.replace(/[\\/]+$/, '')
			.split(/[\\/:]/)
			.pop() ?? '';
	let name = last.replace(/\.git$/i, '');
	try {
		name = decodeURIComponent(name);
	} catch {
		// keep it as written
	}
	// what no file system takes in a name, control characters included
	const safe = [...name].map((c) => (c.charCodeAt(0) < 32 || '/\\:*?"<>|'.includes(c) ? '-' : c)).join('');
	return safe.trim() || 'project';
}

/** the address inside `git clone [options] <address> [folder]`, or the input itself */
function addressIn(input: string): string | null {
	const words = input.trim().split(/\s+/).filter(Boolean);
	if (words[0] === 'git' && words[1] === 'clone') {
		return words.slice(2).find((w) => !w.startsWith('-') && (w.includes('://') || SCP_RE.test(w) || LOCAL_RE.test(w))) ?? null;
	}
	return words.length === 1 ? words[0] : null;
}

/** Hosting pages that are not the repository's address: the repository is their first segments. */
function hostedRepo(url: URL): string | null {
	const host = url.hostname.replace(/^www\./, '').toLowerCase();
	const segments = url.pathname.split('/').filter(Boolean);
	if ((host === 'github.com' || host === 'bitbucket.org') && segments.length >= 2) {
		return `https://${host}/${segments[0]}/${segments[1].replace(/\.git$/i, '')}.git`;
	}
	if (host === 'gitlab.com' && segments.length >= 2) {
		// a group can nest; the page for anything inside the project starts at /-/
		const end = segments.indexOf('-');
		const project = (end === -1 ? segments : segments.slice(0, end)).join('/').replace(/\.git$/i, '');
		return `https://gitlab.com/${project}.git`;
	}
	// an Overleaf project's page, whose git address lives on another host
	if (host === 'overleaf.com' && segments[0] === 'project' && segments[1]) return `https://git.overleaf.com/${segments[1]}`;
	return null;
}

/**
 * The address to clone and the folder to put it in, or null when the input is not an address.
 * Refuses what git would read as an option and the transports that run commands.
 */
export function cloneAddress(input: string): CloneAddress | null {
	const raw = addressIn(input);
	if (!raw || raw.startsWith('-') || /^(ext|fd)::/i.test(raw)) return null;
	if (SCP_RE.test(raw) || LOCAL_RE.test(raw)) return { url: raw, name: nameOf(raw) };
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (!['https:', 'http:', 'ssh:', 'git:', 'file:'].includes(url.protocol)) return null;
	const hosted = url.protocol === 'https:' || url.protocol === 'http:' ? hostedRepo(url) : null;
	const address = hosted ?? raw.replace(/#.*$/, '');
	return { url: address, name: nameOf(new URL(address).pathname) };
}
