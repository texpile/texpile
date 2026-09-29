declare global {
	/** injected by Vite `define`: true in the browser-guest build (`vite build --mode web`). */
	const __WEB__: boolean;

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
		/** End the shell's foreground job and everything under it; resolves true when there was one. */
		interrupt?(id: string): Promise<boolean>;
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
		broken?: boolean;
		/** the command probed, as spawned (a bare name means it came from PATH) */
		command: string;
	};

	type ToolDistro = {
		family: 'latex' | 'typst';
		/** how the install names itself: "TeX Live 2025", "MiKTeX 24.1", "Typst 0.13.1, tinymist 0.13.24" */
		name: string;
		/** the bin folder, the one that goes in front of PATH */
		dir: string;
		/** every folder the install was reached through: the PATH entry, a folder of symlinks the list names */
		dirs: string[];
		/** pdflatex's version line */
		detail: string;
		/** the copy the shell PATH reaches on its own */
		onPath: boolean;
	};

	type TexpileTypstBridge = {
		/** Locate tinymist; null when it isn't installed. */
		resolve(): Promise<TinymistInfo | null>;
		/** Probe every external program the app shells out to. */
		probeToolchain(): Promise<ToolProbe[]>;
		/** each result as it lands, ahead of probeToolchain resolving; returns an unsubscribe fn */
		onProbeResult?(cb: (p: ToolProbe) => void): () => void;
		/** The TeX and Typst installs on this machine, the one PATH reaches marked. */
		distros?(): Promise<ToolDistro[]>;
		/** a .bib from the TeX installation by bare name; null when it has none */
		texBib?(name: string): Promise<string | null>;
		/** a tool folder as absolute, relative (portable app, same drive) and real path, plus whether it exists */
		dirForms(entry: string): Promise<{ absolute: string; relative: string | null; exists: boolean; real: string }>;
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

	/** a paper a title search found (see electron/src/cite/citeSearch.ts) */
	type CiteSearchHit = { doi: string; title: string; authors: string[]; venue: string; year: string; cites: number };

	type TexpileDoiBridge = {
		/** the BibTeX doi.org's registry gives for a DOI (see electron/src/cite/doiLookup.ts) */
		lookup(
			doi: string
		): Promise<{ ok: true; bibtex: string } | { ok: false; reason: 'not-found' | 'no-bibtex' | 'offline' | 'failed'; error?: string }>;
		/** papers matching a title, from Crossref and arXiv's DataCite records, unranked */
		search(query: string): Promise<{ ok: true; hits: CiteSearchHit[] } | { ok: false; reason: 'offline' | 'failed'; error?: string }>;
		/** a book's entry from Open Library, by its 13-digit ISBN */
		isbn(isbn: string): Promise<{ ok: true; bibtex: string } | { ok: false; reason: 'not-found' | 'offline' | 'failed'; error?: string }>;
		/** a PubMed record's DOI, or its entry when it has none */
		pmid(
			pmid: string
		): Promise<
			{ ok: true; doi: string } | { ok: true; bibtex: string } | { ok: false; reason: 'not-found' | 'offline' | 'failed'; error?: string }
		>;
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
		/** DevTools helper for slow launches; see lib/debug/startupDoctor.ts. */
		texpileStartupDoctor: () => Promise<Record<string, unknown>>;
		MathfieldElement: typeof import('mathlive').MathfieldElement;
		mathVirtualKeyboard: import('mathlive').VirtualKeyboardInterface;
		/** Interactive terminal bridge (Electron only; undefined in the browser dev server). */
		texpileTerminal?: TexpileTerminalBridge;
		/** tinymist bridge (Electron only; undefined in the browser dev server). */
		texpileTypst?: TexpileTypstBridge;
		/** Zotero citation bridge (Electron only; undefined in the browser dev server). */
		texpileZotero?: TexpileZoteroBridge;
		/** Cite by DOI's lookup (Electron only; undefined in the browser dev server). */
		texpileDoi?: TexpileDoiBridge;
	}
}

export {};

// @codemirror/search finds the panel's input by this attribute
declare module 'svelte/elements' {
	// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/consistent-type-definitions -- augments svelte's own interface
	interface HTMLInputAttributes {
		'main-field'?: string;
	}
}
