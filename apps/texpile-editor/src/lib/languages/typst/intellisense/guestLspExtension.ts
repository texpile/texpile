// A guest's .typ editor, wired to the host's tinymist.
import { LSPClient, LSPPlugin } from '@codemirror/lsp-client';
import { typstServerExtensions } from './serverExtensions';
import type { Extension } from '@codemirror/state';
import { lspHoverTheme } from './lspClient';
import { sessionUri } from './sessionUri';
import { createSessionTransport, type SessionLspPort } from './sessionTransport';

type GuestSession = {
	client: LSPClient;
	transport: ReturnType<typeof createSessionTransport>;
	holders: number;
};

let guest: GuestSession | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// Same reasoning as the local server's IDLE_GRACE_MS, and it matters MORE here. Switching files
// destroys one editor before creating the next, so holders touch zero on every switch - and a
// teardown at that moment costs a fresh initialize over the relay, during which the extension
// deliberately does not attach. That window is exactly wide enough for the first '#' in the newly
// opened file to do nothing.
const IDLE_GRACE_MS = 30_000;

function cancelIdleTeardown(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
}

function teardown(): void {
	if (!guest) return;
	const dead = guest;
	guest = null;
	try {
		dead.client.disconnect();
	} catch {
		/* the session may already be gone */
	}
	dead.transport.dispose();
}

/**
 * The extension for one open .typ file, `rel` being its manifest-relative path.
 *
 * One client for the whole session rather than one per editor: every request goes to the same
 * server on the host either way, and a client per editor would re-`initialize` on every file
 * switch for nothing.
 *
 * A longer timeout than the local server gets. Every request here crosses a relay twice, and a
 * completion that arrives late is still better than one that is cancelled just as it lands.
 */
export async function typstGuestLspExtension(port: SessionLspPort, rel: string): Promise<Extension | null> {
	cancelIdleTeardown();
	if (!guest) {
		const transport = createSessionTransport(port);
		const client = new LSPClient({
			rootUri: sessionUri(''),
			extensions: typstServerExtensions(),
			timeout: 12000
		});
		client.connect(transport);
		guest = { client, transport, holders: 0 };
	}
	const session = guest;
	session.holders++;
	try {
		// Wait for the handshake, do not just start it. The completion source decides whether a
		// character is worth asking about by looking up serverCapabilities.completionProvider
		// .triggerCharacters - so until the initialize response lands, '#' is not a trigger and
		// typing it does nothing at all. Locally that window is a process start and nobody sees it;
		// across a relay it is long enough to type into, which reads as "the first # never works".
		await session.client.initializing;
		// what the client got back decides whether '#' is even considered worth asking about
		console.info('[guest-lsp] ready', {
			file: rel,
			triggerCharacters: session.client.serverCapabilities?.completionProvider?.triggerCharacters
		});
	} catch {
		// A failed handshake is not a client worth keeping warm: the grace period would cache the
		// corpse, and every re-arm cancels the idle teardown before awaiting the same rejected
		// promise - so one transient host failure would poison every later attempt. Tear it down
		// so the next arm starts clean.
		dropGuestTypstLsp();
		return null;
	}
	return [LSPPlugin.create(session.client, sessionUri(rel), 'typst'), lspHoverTheme];
}

/**
 * Hand back one editor's reference; the last one out schedules a teardown rather than doing one.
 *
 * The grace period is the point, not an optimisation: every file switch passes through zero
 * holders, an immediate teardown forces a fresh initialize across the relay, and the extension
 * (correctly) refuses to attach until that lands - so "switch file, type '#', get nothing" was
 * built into the teardown timing itself.
 */
export function releaseGuestTypstLsp(): void {
	if (!guest) return;
	guest.holders = Math.max(0, guest.holders - 1);
	if (guest.holders > 0) return;
	cancelIdleTeardown();
	idleTimer = setTimeout(() => {
		idleTimer = null;
		// an editor may have taken a reference while the timer ran
		if (guest && guest.holders === 0) teardown();
	}, IDLE_GRACE_MS);
}

/** the session ended under a live editor: fail everything in flight rather than let it hang */
export function dropGuestTypstLsp(): void {
	cancelIdleTeardown();
	teardown();
}
