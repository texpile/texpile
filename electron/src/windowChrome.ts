// The custom window frame: window controls for the renderer's own title bar, and - on macOS only -
// a real native menu bar built from what the renderer reports.
//
// Why the split. On Windows and Linux the window is frameless and the renderer draws everything,
// including minimise / maximise / close, which is how VS Code does it and the only way to get the
// menus and the window buttons onto one row. On macOS a frameless window would throw away the
// traffic lights, the full-screen behaviour and the system menu bar at the top of the screen, none
// of which belong to the window in the first place - so there the window keeps `hiddenInset` and
// the menus move OUT of the renderer into the real menu bar, where mac users look for them.
//
// The renderer stays the single source of truth for what the menus contain. It pushes a compact
// description of its own menu state (which items are enabled, which are checked, the recent folder
// list) and this module turns that into a native template. Clicking a native item sends the same
// value string the in-app menu would have produced, so both paths land in one handler.
import { app, BrowserWindow, Menu, MenuItemConstructorOptions, ipcMain } from 'electron';

/** what the renderer tells us about its menus. Everything optional: a window on the start screen
 *  has no file open and reports almost nothing. */
export type MenuState = {
	/** no file open: the menus that act on a document are greyed out */
	disabled: boolean;
	/** the open file has a text buffer for Edit/Spelling (false for pdf/image/binary). Optional so
	 *  a renderer predating the field falls back to !disabled. */
	editable?: boolean;
	/** the open file is a structured tex/md/typ document, so Insert/Format apply */
	structured?: boolean;
	/** which syntax Insert/Format write; hides the LaTeX-only items for md/typ */
	dialect?: 'tex' | 'md' | 'typ';
	/** the caret is inside a CodeMirror view, where Insert/Format do not apply */
	cursorInCm: boolean;
	spellcheck: boolean;
	terminalAvailable: boolean;
	terminalVisible: boolean;
	canShare: boolean;
	canCloseWorkspace: boolean;
	canFormat: boolean;
	/** the workspace takes tree writes: false for a guest, whose folder belongs to the host */
	canNewFile: boolean;
	/** the compile target is Typst: File > New offers .typ instead of .tex/.cls/.sty */
	typstProject?: boolean;
	/** there is a directory to write an image next to (a .tex on a host) */
	canInsertImage: boolean;
	/** the workspace may be swapped out. False for a guest: it would abandon the session unleft */
	canOpenFolder: boolean;
	canTutorial: boolean;
	recentFolders: string[];
	/** the start screen (or another workspace-less screen): the bar offers only what opens a folder */
	home?: boolean;
	/** already-localized labels, so this module never has to know about locales */
	labels: Record<string, string>;
};

const isMac = process.platform === 'darwin';

/** the last state each window reported, so refocusing a window rebuilds ITS menu */
const states = new Map<number, MenuState>();

function label(s: MenuState, key: string, fallback: string): string {
	return s.labels[key] || fallback;
}

/** send a menu selection to the window it belongs to, in the same `menu:value` shape the in-app
 *  menu bar uses, so the renderer needs one dispatcher rather than two. */
function fire(win: BrowserWindow | null, action: string): void {
	win?.webContents.send('main:menu-action', action);
}

function recentItems(win: BrowserWindow, s: MenuState): MenuItemConstructorOptions[] {
	if (!s.recentFolders.length) return [];
	return [
		{ type: 'separator' },
		{
			label: label(s, 'recent', 'Open Recent'),
			submenu: s.recentFolders.map((folder) => ({
				// the basename is what tells folders apart in a menu; the full path is unreadable at
				// menu width, and the renderer resolves the value back to the path anyway
				label: folder.split(/[\\/]/).filter(Boolean).pop() || folder,
				click: () => fire(win, `openfolder:${folder}`)
			}))
		}
	];
}

/**
 * The macOS template. Deliberately a mirror of WorkspaceMenuBar.svelte rather than a superset: an
 * item here that the in-app bar does not have is an item that will drift, and the previous attempt
 * at a native View/Window menu is exactly how that went wrong.
 */
/** what main itself does for the home bar; the start screen has no menu handlers to fire at */
export type HomeMenuActions = {
	/** pick a folder and open it in THIS window */
	openFolder(win: BrowserWindow): Promise<void>;
	newWindow(): void;
	openFolderNewWindow(win: BrowserWindow): Promise<void>;
};
let homeActions: HomeMenuActions | undefined;

/**
 * The bar for a window with no workspace. Only what can open one: the in-app start screen has
 * the same three affordances and nothing else, and every other native item fires an action a
 * workspace renderer would handle, which this screen does not.
 */
function homeTemplate(win: BrowserWindow, s: MenuState): MenuItemConstructorOptions[] {
	const recents: MenuItemConstructorOptions[] = s.recentFolders.length
		? [
				{ type: 'separator' },
				{
					label: label(s, 'recent', 'Open Recent'),
					submenu: s.recentFolders.map((folder) => ({
						label: folder.split(/[\\/]/).filter(Boolean).pop() || folder,
						click: () => win.webContents.send('main:open-folder', folder)
					}))
				}
			]
		: [];
	return [
		{ role: 'appMenu' },
		{
			label: label(s, 'file', 'File'),
			submenu: [
				{ label: label(s, 'openFolder', 'Open folder…'), accelerator: 'CmdOrCtrl+O', click: () => void homeActions?.openFolder(win) },
				...recents,
				{ type: 'separator' },
				{ label: label(s, 'newWindow', 'New window'), accelerator: 'Shift+CmdOrCtrl+N', click: () => homeActions?.newWindow() },
				{ label: label(s, 'openFolderNewWindow', 'Open folder in new window'), click: () => void homeActions?.openFolderNewWindow(win) }
			]
		},
		{ role: 'editMenu' },
		{ role: 'windowMenu' }
	];
}

function template(win: BrowserWindow, s: MenuState): MenuItemConstructorOptions[] {
	if (s.home) return homeTemplate(win, s);
	const dialect = s.dialect ?? 'tex';
	const doc = { enabled: s.editable ?? !s.disabled }; // needs a text buffer (undo/redo/find/spelling)
	const pm = { enabled: (s.structured ?? !s.disabled) && !s.cursorInCm }; // needs a structured document
	return [
		// The app menu, built by hand rather than `role: 'appMenu'` so Preferences and Share session
		// can sit in it - which is where a mac user reaches for them. Off macOS there is no such menu,
		// so the app icon in the title bar becomes it (AppIconMenu.svelte) with the same two items.
		{
			label: app.name,
			submenu: [
				{ role: 'about', label: label(s, 'about', `About ${app.name}`) },
				{ type: 'separator' },
				{ label: label(s, 'preferences', 'Preferences…'), accelerator: 'CmdOrCtrl+,', click: () => fire(win, 'file:preferences') },
				...(s.canShare ? [{ label: label(s, 'share', 'Share session…'), click: () => fire(win, 'file:share-session') }] : []),
				{ type: 'separator' },
				{ role: 'services', label: label(s, 'services', 'Services') },
				{ type: 'separator' },
				{ role: 'hide', label: label(s, 'hide', `Hide ${app.name}`) },
				{ role: 'hideOthers', label: label(s, 'hideOthers', 'Hide Others') },
				{ role: 'unhide', label: label(s, 'unhide', 'Show All') },
				{ type: 'separator' },
				{ role: 'quit', label: label(s, 'quit', `Quit ${app.name}`) }
			]
		},
		{
			label: label(s, 'file', 'File'),
			submenu: [
				...(s.canNewFile
					? [
							{
								label: label(s, 'new', 'New'),
								// the compile target decides the document rows: .typ for a Typst project,
								// .tex/.cls/.sty otherwise. .bib serves both and markdown is format-neutral.
								submenu: [
									...(s.typstProject
										? [{ label: label(s, 'newTyp', 'Typst document'), click: () => fire(win, 'new:typ') }]
										: [{ label: label(s, 'newTex', 'LaTeX document'), click: () => fire(win, 'new:tex') }]),
									{ label: label(s, 'newBib', 'BibTeX bibliography'), click: () => fire(win, 'new:bib') },
									{ label: label(s, 'newMd', 'Markdown file'), click: () => fire(win, 'new:md') },
									...(s.typstProject
										? []
										: [
												{ label: label(s, 'newCls', 'Class file'), click: () => fire(win, 'new:cls') },
												{ label: label(s, 'newSty', 'Package file'), click: () => fire(win, 'new:sty') }
											])
								]
							}
						]
					: []),
				...(s.canOpenFolder
					? [{ label: label(s, 'openFolder', 'Open folder…'), click: () => fire(win, 'openfolder:newfolder') }, ...recentItems(win, s)]
					: []),
				{ type: 'separator' },
				{ label: label(s, 'newWindow', 'New window'), accelerator: 'Shift+CmdOrCtrl+N', click: () => fire(win, 'file:new-window') },
				{ label: label(s, 'openFolderNewWindow', 'Open folder in new window'), click: () => fire(win, 'file:open-folder-new-window') },
				{ type: 'separator' },
				{ label: label(s, 'save', 'Save'), accelerator: 'CmdOrCtrl+S', click: () => fire(win, 'file:save') },
				...(s.canCloseWorkspace
					? [{ label: label(s, 'closeWorkspace', 'Close folder'), click: () => fire(win, 'file:close-workspace') }]
					: [])
				// Preferences and Share session are in the app menu above, not here
			]
		},
		{
			label: label(s, 'edit', 'Edit'),
			submenu: [
				{ label: label(s, 'palette', 'Command palette'), accelerator: 'CmdOrCtrl+K', click: () => fire(win, 'edit:palette') },
				{ label: label(s, 'goToFile', 'Go to file'), accelerator: 'CmdOrCtrl+T', click: () => fire(win, 'edit:goToFile') },
				{ type: 'separator' },
				// our own undo/redo, not the roles: the document history is ProseMirror's or
				// CodeMirror's, and the native role would only reach a focused native input
				{ ...doc, label: label(s, 'undo', 'Undo'), accelerator: 'CmdOrCtrl+Z', click: () => fire(win, 'edit:undo') },
				{ ...doc, label: label(s, 'redo', 'Redo'), accelerator: 'Shift+CmdOrCtrl+Z', click: () => fire(win, 'edit:redo') },
				{ type: 'separator' },
				{ role: 'cut', label: label(s, 'cut', 'Cut') },
				{ role: 'copy', label: label(s, 'copy', 'Copy') },
				{ role: 'paste', label: label(s, 'paste', 'Paste') },
				{ role: 'selectAll', label: label(s, 'selectAll', 'Select All') },
				{ type: 'separator' },
				{ ...doc, label: label(s, 'find', 'Find'), accelerator: 'CmdOrCtrl+F', click: () => fire(win, 'edit:find') }
			]
		},
		{
			label: label(s, 'view', 'View'),
			submenu: [
				{ label: label(s, 'zoomIn', 'Zoom in'), accelerator: 'CmdOrCtrl+Plus', click: () => fire(win, 'view:zoom-in') },
				{ label: label(s, 'zoomOut', 'Zoom out'), accelerator: 'CmdOrCtrl+-', click: () => fire(win, 'view:zoom-out') },
				{ label: label(s, 'zoomReset', 'Reset zoom'), accelerator: 'CmdOrCtrl+0', click: () => fire(win, 'view:zoom-reset') },
				{ type: 'separator' },
				// Electron's role is a static "Toggle Full Screen"; mac apps say Enter / Exit and flip.
				// Main can read the state directly, and watchWindowState rebuilds on the transition.
				{
					role: 'togglefullscreen',
					label: win.isFullScreen() ? label(s, 'exitFullScreen', 'Exit Full Screen') : label(s, 'enterFullScreen', 'Enter Full Screen')
				}
			]
		},
		{
			label: label(s, 'insert', 'Insert'),
			submenu: [
				{
					...pm,
					label: label(s, 'math', 'Math'),
					submenu: [
						{ label: label(s, 'mathInline', 'Inline equation'), accelerator: 'CmdOrCtrl+M', click: () => fire(win, 'math:inline') },
						{
							label: label(s, 'mathDisplay', 'Display equation'),
							accelerator: 'Shift+CmdOrCtrl+M',
							click: () => fire(win, 'math:display')
						},
						// LaTeX environments; a typst/markdown document has nowhere to put \begin{align}
						...(dialect === 'tex'
							? [
									{ type: 'separator' as const },
									...['align', 'aligned', 'gather', 'cases', 'multline', 'split'].map((env) => ({
										label: env[0].toUpperCase() + env.slice(1),
										click: () => fire(win, `math:${env}`)
									})),
									{ type: 'separator' as const },
									{ label: label(s, 'matrixSquare', 'Matrix (brackets)'), click: () => fire(win, 'math:bmatrix') },
									{ label: label(s, 'matrixParen', 'Matrix (parentheses)'), click: () => fire(win, 'math:pmatrix') }
								]
							: [])
					]
				},
				...(s.canInsertImage ? [{ ...pm, label: label(s, 'image', 'Image…'), click: () => fire(win, 'insert:image') }] : []),
				{ ...pm, label: label(s, 'table', 'Table'), click: () => fire(win, 'insert:table') },
				// markdown has no citation node; tex writes \autocite, typst an @ref chip
				...(dialect !== 'md' ? [{ ...pm, label: label(s, 'citation', 'Citation'), click: () => fire(win, 'insert:citation') }] : []),
				{ ...pm, label: label(s, 'link', 'Link…'), click: () => fire(win, 'insert:link') },
				{ ...pm, label: label(s, 'codeBlock', 'Code block'), click: () => fire(win, 'insert:code') },
				{ ...pm, label: label(s, 'hrule', 'Horizontal rule'), click: () => fire(win, 'insert:hrule') },
				...(dialect === 'tex'
					? [
							{ type: 'separator' as const },
							{ ...pm, label: label(s, 'environment', 'Environment…'), click: () => fire(win, 'insert:environment') },
							{ ...pm, label: label(s, 'rawLatex', 'Raw LaTeX block'), click: () => fire(win, 'insert:rawlatex') },
							{ ...pm, label: label(s, 'inlineLatex', 'Inline LaTeX'), click: () => fire(win, 'insert:inlinelatex') }
						]
					: [])
			]
		},
		{
			label: label(s, 'format', 'Format'),
			submenu: [
				{ ...pm, label: label(s, 'bold', 'Bold'), accelerator: 'CmdOrCtrl+B', click: () => fire(win, 'format:bold') },
				{ ...pm, label: label(s, 'italic', 'Italic'), accelerator: 'CmdOrCtrl+I', click: () => fire(win, 'format:italic') },
				// markdown has no underline mark and no underline syntax
				...(dialect !== 'md'
					? [{ ...pm, label: label(s, 'underline', 'Underline'), accelerator: 'CmdOrCtrl+U', click: () => fire(win, 'format:underline') }]
					: []),
				{ ...pm, label: label(s, 'inlineCode', 'Inline code'), click: () => fire(win, 'format:code') },
				{ type: 'separator' },
				{ ...pm, label: label(s, 'h1', 'Heading 1'), click: () => fire(win, 'format:h1') },
				{ ...pm, label: label(s, 'h2', 'Heading 2'), click: () => fire(win, 'format:h2') },
				{ ...pm, label: label(s, 'h3', 'Heading 3'), click: () => fire(win, 'format:h3') },
				{ ...pm, label: label(s, 'quote', 'Block quote'), click: () => fire(win, 'format:quote') },
				...(s.canFormat
					? [
							{ type: 'separator' as const },
							{ label: label(s, 'formatDocument', 'Format document'), click: () => fire(win, 'format:format-document') }
						]
					: [])
			]
		},
		{
			label: label(s, 'spelling', 'Spelling'),
			submenu: [
				{
					...doc,
					label: label(s, 'checkSpelling', 'Check spelling'),
					type: 'checkbox',
					checked: s.spellcheck,
					click: () => fire(win, 'spelling:toggle')
				},
				{ type: 'separator' },
				{ label: label(s, 'dictionary', 'Edit dictionary…'), click: () => fire(win, 'spelling:dictionary') }
			]
		},
		...(s.terminalAvailable
			? [
					{
						label: label(s, 'terminal', 'Terminal'),
						submenu: [
							{ label: label(s, 'compile', 'Compile'), accelerator: 'Alt+CmdOrCtrl+Return', click: () => fire(win, 'terminal:compile') },
							{ label: label(s, 'configureCompile', 'Configure compile command…'), click: () => fire(win, 'terminal:configure') },
							{ type: 'separator' as const },
							{ label: label(s, 'newTerminal', 'New terminal'), click: () => fire(win, 'terminal:new') },
							{
								label: label(s, 'showTerminal', 'Show terminal'),
								type: 'checkbox' as const,
								checked: s.terminalVisible,
								click: () => fire(win, 'terminal:toggle')
							}
						]
					}
				]
			: []),
		// The role stays: it is what calls [NSApp setWindowsMenu:], which is how AppKit knows to append
		// the live window list and the tab items. But a label on the parent renames only the title -
		// the stock submenu is nested roles carrying Electron's own English - so it is spelt out here.
		{
			role: 'windowMenu',
			label: label(s, 'window', 'Window'),
			submenu: [
				{ role: 'minimize', label: label(s, 'minimize', 'Minimize') },
				{ role: 'zoom', label: label(s, 'zoom', 'Zoom') },
				{ type: 'separator' },
				{ role: 'front', label: label(s, 'front', 'Bring All to Front') }
			]
		},
		{
			role: 'help',
			label: label(s, 'help', 'Help'),
			submenu: [
				{ label: label(s, 'shortcuts', 'Keyboard shortcuts'), click: () => fire(win, 'help:shortcuts') },
				...(s.canTutorial ? [{ label: label(s, 'tutorial', 'Open tutorial'), click: () => fire(win, 'help:tutorial') }] : []),
				{ label: label(s, 'whatsNew', "What's new"), click: () => fire(win, 'help:whatsnew') },
				{ type: 'separator' },
				{ label: label(s, 'documentation', 'Documentation'), click: () => fire(win, 'help:docs') },
				{ label: label(s, 'discord', 'Join Discord'), click: () => fire(win, 'help:discord') },
				{ label: label(s, 'support', 'Contact support'), click: () => fire(win, 'help:support') },
				{ type: 'separator' },
				// Dev Tools is a command-palette entry now (search "dev"), not a menu item: a diagnostic
				// does not belong in the menu writers open for tutorials. Still no keyboard accelerator
				// anywhere - a writer must never open a debugger by fumbling a shortcut mid-sentence.
				{ label: label(s, 'updates', 'Check for updates'), click: () => fire(win, 'help:updates') }
			]
		}
	];
}

/** rebuild the application menu from the focused window's reported state (macOS only) */
function rebuild(): void {
	if (!isMac) return;
	const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
	const s = win ? states.get(win.webContents.id) : undefined;
	// Nothing reported yet (launching, or a window that never mounted the menu bar): keep the
	// minimal bar so Cmd+Q and copy/paste in native inputs still work.
	if (!win || !s) {
		Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
		return;
	}
	Menu.setApplicationMenu(Menu.buildFromTemplate(template(win, s)));
}

/** what the renderer last reported about its chrome, for seeding the next window's first paint. */
export type ChromeColors = {
	height?: number;
	color?: string;
	symbolColor?: string;
	background?: string;
};

/**
 * @param onChrome called whenever the renderer reports its title bar colours, so main can persist
 *   them. Kept as a callback rather than importing the settings helpers, because those live in
 *   main.ts and main.ts already imports this module.
 */
export function registerWindowChrome(onChrome?: (c: ChromeColors) => void, home?: HomeMenuActions): void {
	homeActions = home;
	// ---- window controls, for the renderer's own title bar (Windows / Linux) ----
	ipcMain.handle('window:minimize', (e) => {
		BrowserWindow.fromWebContents(e.sender)?.minimize();
	});
	ipcMain.handle('window:toggleMaximize', (e) => {
		const win = BrowserWindow.fromWebContents(e.sender);
		if (!win) return false;
		if (win.isMaximized()) win.unmaximize();
		else win.maximize();
		return win.isMaximized();
	});
	// goes through the normal close path, so the unsaved-changes hold in main.ts still applies
	ipcMain.handle('window:close', (e) => {
		BrowserWindow.fromWebContents(e.sender)?.close();
	});
	ipcMain.handle('window:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

	/**
	 * Repaint the window-controls overlay, and the window behind it, to match the renderer.
	 *
	 * Chromium draws those buttons, so it has to be told our colours; main cannot work them out
	 * because the theme is in localStorage. `height` arrives already multiplied by the zoom factor:
	 * the overlay is sized in device pixels and does not scale with setZoomFactor, so a zoomed-in
	 * window needs a taller strip to stay level with a title bar that grew.
	 *
	 * `background` is the WINDOW's fill, not the bar's, and it is what stops the white flash when a
	 * dark-themed window is maximised or restored: Chromium paints newly exposed area with it before
	 * the renderer gets there.
	 *
	 * Both are persisted, because the first paint of the NEXT launch happens before any renderer
	 * exists - that is why the buttons appear in a pale strip on a blank window at startup. Seeding
	 * createWindow from the last known values closes that gap for everyone but a genuine first run.
	 *
	 * The overlay half is a no-op on macOS, where the window has a real frame and setTitleBarOverlay
	 * throws rather than being ignored.
	 */
	ipcMain.on('window:overlay', (e, o: { height?: number; color?: string; symbolColor?: string; background?: string }) => {
		const win = BrowserWindow.fromWebContents(e.sender);
		if (!win) return;
		if (o.background) win.setBackgroundColor(o.background);
		if (!isMac) {
			try {
				win.setTitleBarOverlay({ height: o.height, color: o.color, symbolColor: o.symbolColor });
			} catch {
				/* a window built without titleBarOverlay has nothing to update */
			}
		}
		onChrome?.(o);
	});

	// ---- menu state, for the native macOS bar ----
	ipcMain.on('window:menu-state', (e, state: MenuState) => {
		states.set(e.sender.id, state);
		// only the focused window owns the menu bar; a background window's push is stored for when
		// it comes forward
		if (isMac && BrowserWindow.fromWebContents(e.sender)?.isFocused()) rebuild();
	});

	if (isMac) {
		app.on('browser-window-focus', () => rebuild());
		rebuild(); // the minimal bar until a renderer reports in
	} else {
		Menu.setApplicationMenu(null);
	}
}

/** a window has gone; drop its menu state and hand the bar back to whoever is left */
export function forgetWindowChrome(wcId: number): void {
	states.delete(wcId);
	rebuild();
}

/** tell a renderer its maximise state changed, so the title bar can swap the restore icon */
export function watchWindowState(win: BrowserWindow): void {
	function push(): void {
		if (win.isDestroyed()) return;
		win.webContents.send('main:window-state', { maximized: win.isMaximized(), fullScreen: win.isFullScreen() });
	}
	// the View item reads Enter or Exit off the current state, so the bar has to follow the transition
	function pushAndRebuild(): void {
		push();
		rebuild();
	}
	win.on('maximize', push);
	win.on('unmaximize', push);
	win.on('enter-full-screen', pushAndRebuild);
	win.on('leave-full-screen', pushAndRebuild);
	// the renderer mounts after the window exists, so seed it once it has loaded
	win.webContents.on('did-finish-load', push);
}
