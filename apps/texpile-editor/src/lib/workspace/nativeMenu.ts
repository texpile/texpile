// Renderer end of the native macOS menu bar.
//
// Off macOS this is inert: the in-app menu bar draws the menus and main removes the native one, so
// publishMenuState just records a payload nobody reads and no actions ever arrive.
//
// On macOS the menus are real system menus. Two directions:
//
//   out - a description of this window's menu state (enabled/checked flags, the recent folder list)
//   plus every LABEL, already localized. Main owns the template but knows nothing about locales, so
//   the strings come from here; that also means a language change re-sends and the bar follows.
//
//   in - a selection, as the same `menu:value` string the in-app menu would have produced, routed
//   into the very same handlers. One implementation, two front ends.
import { browser } from '$lib/runtime';
import { isMac } from '$lib/platform';
import { recentFolders } from './workspaceStore';
import { m } from '$lib/paraglide/messages';

type NativeMenuApi = {
	publishMenuState?: (state: unknown) => void;
	onMenuAction?: (cb: (action: string) => void) => () => void;
};
function api(): NativeMenuApi | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: NativeMenuApi }).texpileNative;
}

/** one handler per menu, each taking the item's value - the same signature the in-app selects use */
export type NativeMenuHandlers = {
	file(value: string): void;
	newFile(value: string): void;
	openFolder(value: string): void;
	edit(value: string): void;
	view(value: string): void;
	insert(value: string): void;
	math(value: string): void;
	format(value: string): void;
	spelling(value: string): void;
	terminal(value: string): void;
	help(value: string): void;
};

/** the flags main needs; the labels are added here */
export type MenuStateInput = {
	disabled: boolean;
	/** the open file has a text buffer for Edit/Spelling to act on (false for pdf/image/binary) */
	editable: boolean;
	/** the open file is a structured tex/md/typ document, so Insert/Format apply */
	structured: boolean;
	/** which syntax Insert/Format write; decides the LaTeX-only items' visibility */
	dialect: 'tex' | 'md' | 'typ';
	cursorInCm: boolean;
	spellcheck: boolean;
	terminalAvailable: boolean;
	terminalVisible: boolean;
	canShare: boolean;
	canCloseWorkspace: boolean;
	canFormat: boolean;
	/** the three a guest lacks: no tree writes, nowhere to put an image, no workspace to swap */
	canNewFile: boolean;
	/** the compile target is Typst: File > New offers .typ instead of .tex/.cls/.sty */
	typstProject: boolean;
	canInsertImage: boolean;
	canOpenFolder: boolean;
	canTutorial: boolean;
	recentFolders: string[];
};

// main knows this as app.name, but the strings that embed it are ours to translate, so the
// substitution happens here. menubar_version_footer already hardcodes it the same way.
const APP = 'Texpile';

/** every label the native template can ask for, keyed the way windowChrome.ts looks them up */
function labels(tool: 'latexindent' | 'typstyle'): Record<string, string> {
	return {
		file: m.menubar_menu_file(),
		edit: m.menubar_menu_edit(),
		view: m.menubar_menu_view(),
		insert: m.menubar_menu_insert(),
		format: m.menubar_menu_format(),
		spelling: m.menubar_menu_spelling(),
		terminal: m.menubar_menu_terminal(),
		new: m.menubar_new_file_menu(),
		newTex: m.menubar_new_tex(),
		newTyp: m.menubar_new_typ(),
		newBib: m.menubar_new_bib(),
		newMd: m.menubar_new_md(),
		newCls: m.menubar_new_cls(),
		newSty: m.menubar_new_sty(),
		openFolder: m.menubar_open_new_folder(),
		recent: m.menubar_recent_heading(),
		newWindow: m.menubar_new_window(),
		openFolderNewWindow: m.menubar_open_folder_new_window(),
		share: m.menubar_share_session(),
		save: m.menubar_save(),
		closeWorkspace: m.menubar_close_workspace(),
		preferences: m.menubar_preferences(),
		palette: m.palette_open(),
		goToFile: m.palette_group_go(),
		undo: m.menubar_undo(),
		redo: m.menubar_redo(),
		find: m.menubar_find(),
		zoomIn: m.menubar_zoom_in(),
		zoomOut: m.menubar_zoom_out(),
		zoomReset: m.menubar_zoom_reset(),
		math: m.menubar_insert_math_menu(),
		mathInline: m.menubar_inline_equation(),
		mathDisplay: m.menubar_display_equation(),
		matrixSquare: m.menubar_math_matrix_square(),
		matrixParen: m.menubar_math_matrix_paren(),
		image: m.menubar_insert_image(),
		table: m.menubar_insert_table(),
		citation: m.menubar_insert_citation(),
		link: m.menubar_insert_link(),
		codeBlock: m.menubar_insert_code_block(),
		hrule: m.menubar_insert_hrule(),
		environment: m.menubar_insert_environment(),
		rawLatex: m.menubar_insert_raw_latex(),
		inlineLatex: m.menubar_insert_inline_latex(),
		bold: m.menubar_format_bold(),
		italic: m.menubar_format_italic(),
		underline: m.menubar_format_underline(),
		inlineCode: m.menubar_format_inline_code(),
		h1: m.menubar_heading_1(),
		h2: m.menubar_heading_2(),
		h3: m.menubar_heading_3(),
		quote: m.menubar_format_blockquote(),
		formatDocument: m.menubar_format_document({ tool }),
		checkSpelling: m.menubar_check_spelling(),
		dictionary: m.menubar_edit_dictionary(),
		compile: m.menubar_terminal_compile(),
		configureCompile: m.menubar_configure_compile_command(),
		newTerminal: m.menubar_new_terminal(),
		showTerminal: m.menubar_show_terminal(),
		shortcuts: m.menubar_keyboard_shortcuts(),
		tutorial: m.menubar_open_tutorial(),
		whatsNew: m.whatsnew_menu_label(),
		documentation: m.menubar_documentation(),
		discord: m.menubar_join_discord(),
		support: m.menubar_contact_support(),
		updates: m.menubar_check_for_updates(),
		// Roles carry a label of Electron's own, hardcoded English in a table inside Electron, and
		// macOS never gets asked for its translation - a role only registers the menu, it does not
		// retitle it. So every role that shows a string needs one of ours. The items AppKit appends
		// itself (the window list, the tab items, the Help search field) are already localized.
		help: m.menubar_menu_help(),
		window: m.menubar_mac_menu_window(),
		about: m.menubar_mac_about({ app: APP }),
		services: m.menubar_mac_services(),
		hide: m.menubar_mac_hide({ app: APP }),
		hideOthers: m.menubar_mac_hide_others(),
		unhide: m.menubar_mac_unhide(),
		quit: m.menubar_mac_quit({ app: APP }),
		cut: m.menubar_mac_cut(),
		copy: m.menubar_mac_copy(),
		paste: m.menubar_mac_paste(),
		selectAll: m.menubar_mac_select_all(),
		enterFullScreen: m.menubar_mac_enter_full_screen(),
		exitFullScreen: m.menubar_mac_exit_full_screen(),
		minimize: m.menubar_mac_minimize(),
		zoom: m.menubar_mac_zoom(),
		front: m.menubar_mac_front()
	};
}

export function publishMenuState(state: MenuStateInput): void {
	// off macOS nobody reads this, and building it means calling sixty message functions on every
	// menu-state change (every file switch, every terminal toggle) for a payload that is discarded
	if (!isMac) return;
	api()?.publishMenuState?.({ ...state, labels: labels(state.dialect === 'typ' ? 'typstyle' : 'latexindent') });
}

/** a screen with no workspace: the bar keeps only what opens one, with this window's recents */
export function publishHomeMenuState(): void {
	if (!isMac) return;
	api()?.publishMenuState?.({ home: true, recentFolders: recentFolders.current, labels: labels('latexindent') });
}

/** wire the native selections into the in-app handlers; returns the detach function */
export function attachNativeMenu(handlers: NativeMenuHandlers): () => void {
	const off = api()?.onMenuAction?.((action) => {
		const at = action.indexOf(':');
		if (at === -1) return;
		const menu = action.slice(0, at);
		const value = action.slice(at + 1);
		switch (menu) {
			case 'file':
				return handlers.file(value);
			case 'new':
				return handlers.newFile(value);
			// a recent-folder item carries the path itself, exactly as the in-app submenu does
			case 'openfolder':
				return handlers.openFolder(value);
			case 'edit':
				return handlers.edit(value);
			case 'view':
				return handlers.view(value);
			case 'insert':
				return handlers.insert(value);
			case 'math':
				return handlers.math(value);
			case 'format':
				return handlers.format(value);
			case 'spelling':
				return handlers.spelling(value);
			case 'terminal':
				return handlers.terminal(value);
			case 'help':
				return handlers.help(value);
		}
	});
	return () => off?.();
}

/** the recent folder list as main should show it; kept here so the shape stays with the labels */
export function currentRecentFolders(): string[] {
	return recentFolders.current;
}
