declare global {
	/** injected by Vite `define` from package.json. */
	const __APP_VERSION__: string;

	/** injected by Vite `define`: every released CHANGELOG.md entry, newest first. */
	const __WHATS_NEW__: { version: string; date?: string; notes: string[] }[];

	type TexpileTerminalBridge = {
		/** False if node-pty failed to load (needs `pnpm electron:rebuild`). */
		available(): Promise<boolean>;
		/** Spawn or reuse a shell for `id` in `cwd`. `shell` is the executable's basename (e.g. "cmd.exe"). */
		spawn(opts: { id: string; cwd?: string; cols?: number; rows?: number }): Promise<{ ok: boolean; shell?: string; error?: string }>;
		/** Send keystrokes / a command (append '\r' to run). */
		write(id: string, input: string): void;
		resize(id: string, cols: number, rows: number): void;
		kill(id: string): void;
		/** Subscribe to output; returns an unsubscribe fn. */
		// eslint-disable-next-line id-denylist -- `data` is the preload message's field name
		onData(cb: (msg: { id: string; data: string }) => void): () => void;
		/** Subscribe to shell exit; returns an unsubscribe fn. */
		onExit(cb: (msg: { id: string; code: number }) => void): () => void;
	};

	type TinymistInfo = {
		/** the command that was spawned: an absolute path, or the bare name when found on PATH */
		command: string;
		/** tinymist's own version, e.g. "0.15.2" */
		version: string;
		/** the Typst version its embedded compiler is - what actually builds the PDF */
		typstVersion: string;
		/** which candidate answered; there is no configured path (see typstService.ts) */
		source: 'path' | 'managed';
	};

	type ToolProbe = {
		id: string;
		found: boolean;
		/** first informative line of the tool's own version output, when it gave one */
		detail?: string;
		/** the command probed, as spawned (a bare name means it came from PATH) */
		command: string;
	};

	type TexpileTypstBridge = {
		/** Locate tinymist; null when it isn't installed. */
		resolve(): Promise<TinymistInfo | null>;
		/** Probe every external program the app shells out to. */
		probeToolchain(): Promise<ToolProbe[]>;
		/** Fetch tinymist's preview page, theme it, re-serve it from typstpreview://. */
		preparePreview(host: string, background: string, foreground: string): Promise<{ ok: boolean; url?: string; error?: string }>;
		releasePreview(): void;
		/** The raw page as tinymist serves it, for a session host to ship to guests. */
		previewPageHtml(host: string): Promise<{ ok: boolean; html?: string; error?: string }>;
		/** Serve the host-shipped page for this (guest) window's frame; networkless CSP. */
		prepareGuestPreview(html: string, background: string, foreground: string): Promise<{ ok: boolean; url?: string; error?: string }>;
		/** Preview relay (host side): one websocket leg to the preview data plane per guest. */
		relayOpen(id: number, host: string): void;
		relaySend(id: number, payload: string | ArrayBuffer): void;
		relayClose(id: number): void;
		/** Subscribe to relay socket events; returns an unsubscribe fn. */
		// eslint-disable-next-line id-denylist -- `data` is the preload event's field name
		onRelayEvent(cb: (e: { id: number; ev: 'open' | 'data' | 'close'; data?: string | ArrayBuffer }) => void): () => void;
		/** Spawn `tinymist lsp` for this window, rooted at `root`. */
		// eslint-disable-next-line id-denylist -- `info` is the preload result's field name
		startLsp(root: string | null): Promise<{ ok: boolean; info?: TinymistInfo; error?: string }>;
		/** Send one JSON-RPC message; the main process adds the Content-Length framing. */
		send(json: string): void;
		stopLsp(): void;
		/** Subscribe to server->client messages; returns an unsubscribe fn. */
		onMessage(cb: (json: string) => void): () => void;
		/** Subscribe to server exit; returns an unsubscribe fn. */
		onExit(cb: (code: number | null) => void): () => void;
	};

	type TexpileZoteroBridge = {
		/** Is Zotero up, and does it have the Better BibTeX plugin. */
		probe(): Promise<{ ok: boolean; running: boolean; bbt: boolean }>;
		/** Library matches for a query, with their citekeys; feeds the in-app picker dialog. */
		search(
			query: string
		): Promise<{ ok: boolean; items?: { citekey: string; title: string; author: string; year: string }[]; error?: string }>;
		/** The picked entries as bib text, via the named Better BibTeX translator. */
		exportBib(keys: string[], translator: string): Promise<{ ok: boolean; bib?: string; error?: string }>;
	};

	/** The personal bibliography: one library.bib in userData, read and written whole. */
	type TexpileLibraryBridge = {
		/** The whole library as bib text; '' when it does not exist yet. */
		read(): Promise<{ ok: boolean; text?: string; error?: string }>;
		/** Replace the whole library with `text`. */
		write(text: string): Promise<{ ok: boolean; error?: string }>;
	};

	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- augmenting lib.dom's Window needs declaration merging
	interface Window {
		texpile: {
			debug: {
				log: boolean;
				codemirror?: import('@codemirror/view').EditorView;
			};
		};
		/** DevTools helper for the caret-vanished reports; see lib/debug/focusDoctor.ts. */
		texpileFocusDoctor: () => Record<string, unknown>;
		MathfieldElement: typeof import('mathlive').MathfieldElement;
		mathVirtualKeyboard: import('mathlive').VirtualKeyboardInterface;
		/** Interactive terminal bridge (Electron only; undefined in the browser dev server). */
		texpileTerminal?: TexpileTerminalBridge;
		/** tinymist bridge (Electron only; undefined in the browser dev server). */
		texpileTypst?: TexpileTypstBridge;
		/** Zotero citation bridge (Electron only; undefined in the browser dev server). */
		texpileZotero?: TexpileZoteroBridge;
		/** Personal bibliography bridge (Electron only; undefined in the browser dev server). */
		texpileLibrary?: TexpileLibraryBridge;
	}
}

export {};
