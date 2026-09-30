// The host half of Typst intellisense for guests: answer a guest's LSP request with the host's own
// tinymist, against the host's own files.
//
// The host is the only disk-writer in a session, so it already holds the whole project - sources,
// bibliographies, images, fonts, the package cache. That is the point of doing it here: a guest's
// completion resolves `#image("logo.png")` and `@knuth1984` because the file is genuinely on the
// disk being read, not because we remembered to ship that particular kind of file.
//
// This file owns the only boundary in the design: guests speak manifest-relative paths under the
// `texpile-session:` scheme, the host speaks absolute file:// paths. Nothing platform-shaped
// crosses it - the host resolves against its real workspace root, so there is no invented root to
// get wrong per OS.
import type { LSPClient } from '@codemirror/lsp-client';
import type { ControlPayload } from '$lib/collab/protocol';
import { joinPath, relativeTo } from '$lib/workspace/fileSystem';
import { fileUri, pathFromUri } from '../lspClient';
import { sessionUri, relFromSessionUri, mapUris } from './sessionUri';
import { normalizeFieldlessSnippets } from '../completion/completionNormalize';
import { ProjectFileSet, PROJECT_FILE_RE, type ProjectFile } from '../../projectFiles';

export type LspRequest = Extract<ControlPayload, { kind: 'lsp-request' }>;
export type LspResult = Extract<ControlPayload, { kind: 'lsp-result' }>;
export type LspNotify = Extract<ControlPayload, { kind: 'lsp-notify' }>;

/** What the responder needs from the session, kept narrow so it can be tested without one. */
export type GuestLspContext = {
	/** the host's real workspace root */
	root: string;
	/** the host's tinymist, or null when it is not running */
	client(): Promise<LSPClient | null>;
	/**
	 * Land every debounced guest write before the server reads anything.
	 *
	 * materialize.ts debounces write-through by 400ms, which is invisible to every other reader
	 * but not to this one: a guest types `#stri` and asks what completes it in the same breath,
	 * and a server reading 400ms-old bytes answers about the wrong word.
	 *
	 * Deliberately not per-file. An answer about `main.typ` is drawn partly from what `lib.typ`
	 * exports, so flushing only the file in the request would still consult a stale import that
	 * another collaborator is editing right now.
	 */
	flush(): Promise<void>;
	/** every text file in the session, straight from the Y.Doc - the truth the disk lags behind */
	projectFiles(): ProjectFile[];
};

/**
 * One open-document set per client, keyed weakly so a server restart simply grows a fresh set -
 * the dead client's set dies with it, with nothing to close on a server that is already gone.
 */
const projectSets = new WeakMap<LSPClient, ProjectFileSet>();

function projectSetFor(client: LSPClient, root: string): ProjectFileSet {
	let set = projectSets.get(client);
	if (!set) {
		set = new ProjectFileSet(client, (rel) => fileUri(joinPath(root, rel)));
		projectSets.set(client, set);
	}
	return set;
}

/** Methods a guest may ask for. An allow-list, because this executes against the host's machine. */
const ALLOWED = new Set([
	'initialize',
	'textDocument/completion',
	'completionItem/resolve',
	'textDocument/hover',
	'textDocument/definition',
	'textDocument/declaration',
	'textDocument/references',
	'textDocument/documentSymbol',
	'textDocument/signatureHelp',
	'textDocument/foldingRange',
	'textDocument/selectionRange',
	'textDocument/semanticTokens/full',
	'textDocument/documentHighlight',
	'textDocument/inlayHint',
	'textDocument/codeAction',
	'textDocument/documentLink',
	'textDocument/documentColor',
	'textDocument/colorPresentation',
	'workspace/symbol'
]);

/**
 * The absolute path behind a file:// URI, or null for anything else.
 *
 * pathFromUri hands back its input untouched when it cannot parse one, so the scheme has to be
 * checked here - otherwise a `texpile-session:` URI that slipped through unmapped would be treated
 * as a path and rejoined against the root.
 */
function absFromFileUri(uri: string): string | null {
	return /^file:\/\//i.test(uri) ? pathFromUri(uri) : null;
}

/**
 * The manifest-relative path for an absolute one inside the project, or null when it is outside it.
 *
 * relativeTo is best-effort: given a path that is not under `root` it returns that path unchanged,
 * which is absolute rather than relative and would hand a guest a location on the host's disk. So
 * containment is checked here rather than assumed, and anything outside becomes null - a package's
 * source or tinymist's own stdlib is not a file the guest can open.
 */
function relInProject(root: string, abs: string): string | null {
	const rel = relativeTo(root, abs).replace(/\\/g, '/');
	if (!rel || rel === abs.replace(/\\/g, '/')) return null;
	if (rel.startsWith('..') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
	return rel;
}

/**
 * One file's diagnostics, as a frame for the guests, or null when they are not the guests' business.
 *
 * Diagnostics are pushed rather than requested, so without this a guest sees an unmarked document
 * while the host sees the errors - which reads as "it works on my machine" in the one situation
 * where both people are looking at the same file. An EMPTY list is meaningful and forwarded: that
 * is how LSP says a file is clean now, and dropping it would leave stale squiggles behind.
 */
export function diagnosticsNotificationForGuest(absPath: string, diagnostics: unknown[], root: string): LspNotify | null {
	const rel = relInProject(root, absPath);
	// a diagnostic about tinymist's own stdlib or a package is not a file the guest has
	if (!rel) return null;
	return { kind: 'lsp-notify', method: 'textDocument/publishDiagnostics', params: { uri: sessionUri(rel), diagnostics } };
}

/**
 * Serve one guest request. Never throws: a failure comes back as a result the guest can settle on,
 * because a guest whose completion promise never resolves has an editor that appears to hang.
 */
export async function serveGuestLspRequest(payload: LspRequest, ctx: GuestLspContext): Promise<LspResult> {
	function fail(error: string): LspResult {
		// the guest sees only an absent popup, so the reason has to land somewhere
		console.warn('[guest-lsp] cannot answer', { method: payload.method, error });
		return { kind: 'lsp-result', reqId: payload.reqId, ok: false, error };
	}

	if (!ALLOWED.has(payload.method)) return fail(`unsupported method: ${payload.method}`);

	try {
		const client = await ctx.client();
		if (!client) return fail('the host is not running tinymist');

		// `initialize` is answered from cache, never forwarded: the host's server is already up and
		// serving the host's own editors, and initialising it twice is a protocol error.
		if (payload.method === 'initialize') {
			// typstClient resolves when the PROCESS is up, which is not the same as the handshake
			// being done - and capabilities only exist after the handshake. Answering early hands
			// back an empty set, and empty capabilities do not fail: they silently register no
			// completion provider, so the guest's editor simply never responds to '#'.
			await client.initializing;
			const capabilities = client.serverCapabilities;
			if (!capabilities) return fail('the host server has not finished starting');
			return { kind: 'lsp-result', reqId: payload.reqId, ok: true, result: { capabilities } };
		}

		// Three staleness routes, and a guest request hits whichever applies.
		//
		// flush(): land pending write-through on disk. Necessary for compile correctness, but NOT
		// sufficient for answers - with any document open, tinymist's project cache picks disk
		// changes up through its file watcher, which lags the write by over a second (measured:
		// ask right after the write = 0 items, same ask 1.5s later = 21).
		await ctx.flush();

		// reconcile(): the actual fix for that lag. Session files are handed to the server as OPEN
		// documents rebuilt from the Y.Doc, and an open document's shadow copy is authoritative
		// the moment the didChange is on the pipe - no watcher involved (measured: stale disk plus
		// a fresh didOpen answers correctly, immediately). The file the host's own editor holds is
		// skipped; it is covered by sync() below.
		projectSetFor(client, ctx.root).reconcile(ctx.projectFiles().filter((f) => PROJECT_FILE_RE.test(f.rel)));

		// sync(): the host-editor-owned document advances only when the client flushes its pending
		// changes, which otherwise happens just before the HOST's own requests - a host who is
		// reading rather than typing never triggers one.
		client.sync();

		const params = mapUris(payload.params, (uri) => {
			const rel = relFromSessionUri(uri);
			return rel == null ? null : fileUri(joinPath(ctx.root, rel));
		});

		const result = await client.request<unknown, unknown>(payload.method, params ?? {});

		// the guest's own editor library has the same snippet semantics as the host's, so its
		// caret needs the same normalization; doing it here covers every guest at once
		if (payload.method === 'textDocument/completion' || payload.method === 'completionItem/resolve') {
			normalizeFieldlessSnippets(result);
		}

		if (payload.method === 'textDocument/completion') {
			// the other half of the guest's `<-` line: if these two counts differ, the relay lost
			// or mangled the reply; if both are zero, tinymist itself answered about stale text
			const r = result as { items?: unknown[] } | unknown[] | null;
			const count = Array.isArray(r) ? r.length : (r?.items?.length ?? 0);
			console.info('[guest-lsp] answered', { reqId: payload.reqId, count });
		}

		// back to the guest's namespace. A result naming a file outside the project (a package's
		// source, tinymist's own stdlib) has no session path, so mapUris drops the key rather than
		// handing a guest an absolute path on someone else's machine.
		return {
			kind: 'lsp-result',
			reqId: payload.reqId,
			ok: true,
			result: mapUris(result, (uri) => {
				const abs = absFromFileUri(uri);
				const rel = abs && relInProject(ctx.root, abs);
				return rel ? sessionUri(rel) : null;
			})
		};
	} catch (e) {
		return fail(e instanceof Error ? e.message : String(e));
	}
}
