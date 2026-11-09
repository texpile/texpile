import type { DefaultKeybinding } from './keybindingRules';

// run by each editor from its own keymap, so a key keeps its place among the editor's others; the same command and key
// in the source and visual editors of every language that has it
const EDITOR_KEYBINDINGS: DefaultKeybinding[] = [
	{ command: 'editor.bold', key: 'mod+b' },
	{ command: 'editor.italic', key: 'mod+i' },
	{ command: 'editor.emphasis', key: 'mod+e' },
	{ command: 'editor.underline', key: 'mod+u' },
	{ command: 'editor.inlineCode', key: 'mod+`' },
	{ command: 'editor.superscript', key: 'mod+.' },
	// Mod+, is Preferences, as in every desktop app
	{ command: 'editor.subscript', key: 'mod+shift+,' },
	{ command: 'editor.strikethrough', key: 'mod+shift+x' },
	{ command: 'editor.blockquote', key: 'mod+shift+b' },
	{ command: 'editor.codeBlock', key: 'mod+shift+`' },
	// Word and Docs: Mod+Alt+N, Mod+Alt+0 back to text. Ctrl+Alt+digit types a character on AltGr layouts, so Windows
	// and Linux keep Mod+Shift+N too; Cmd+Shift+3 to 5 are screenshots on macOS
	...[0, 1, 2, 3, 4, 5, 6].map((n) => ({ command: `editor.heading${n}`, key: `mod+alt+${n}` })),
	...[1, 2, 3].map((n) => ({ command: `editor.heading${n}`, key: `mod+shift+${n}`, mac: null })),
	{ command: 'editor.inlineMath', key: 'mod+m' },
	{ command: 'editor.displayMath', key: 'mod+shift+m' },
	{ command: 'editor.find', key: 'mod+f' },
	{ command: 'editor.pasteWithoutFormatting', key: 'mod+shift+v' },
	{ command: 'editor.goToDefinition', key: 'f12' },
	{ command: 'editor.renameSymbol', key: 'f2' },
	// VS Code's Trigger Parameter Hints
	{ command: 'editor.argumentHints', key: 'mod+shift+space' },
	{ command: 'editor.quickFix', key: 'alt+enter' },
	{ command: 'editor.nextSpellingProblem', key: 'f8' },
	{ command: 'editor.previousSpellingProblem', key: 'shift+f8' },
	{ command: 'editor.nextChange', key: 'alt+f5' },
	{ command: 'editor.previousChange', key: 'shift+alt+f5' },
	// the figure tab's, which its zoom keys take from the window's
	{ command: 'figure.undo', key: 'mod+z' },
	{ command: 'figure.redo', key: 'mod+shift+z' },
	{ command: 'figure.redo', key: 'mod+y' },
	{ command: 'figure.duplicate', key: 'mod+d' },
	{ command: 'figure.selectAll', key: 'mod+a' },
	{ command: 'figure.lock', key: 'mod+shift+l' },
	{ command: 'figure.grid', key: "mod+'" },
	{ command: 'figure.copyStyle', key: 'mod+alt+c' },
	{ command: 'figure.pasteStyle', key: 'mod+alt+v' },
	{ command: 'figure.bringToFront', key: 'mod+shift+]' },
	{ command: 'figure.bringForward', key: 'mod+]' },
	{ command: 'figure.sendBackward', key: 'mod+[' },
	{ command: 'figure.sendToBack', key: 'mod+shift+[' },
	{ command: 'figure.group', key: 'mod+g' },
	{ command: 'figure.ungroup', key: 'mod+shift+g' },
	{ command: 'figure.zoomIn', key: 'mod+=' },
	{ command: 'figure.zoomIn', key: 'mod+shift+=' },
	{ command: 'figure.zoomOut', key: 'mod+-' },
	{ command: 'figure.zoomOut', key: 'mod+shift+-' },
	{ command: 'figure.zoom100', key: 'mod+0' }
].map((rule) => ({ ...rule, editor: true as const }));

// a vim user's Ctrl+O and Ctrl+W are vim's; on macOS the app's keys are on Cmd and nothing collides
const NOT_VIM = '(isMac || !(sourceEditorFocus && editorKeymap == vim))';

// app keys an editor may also use are late: they run when no editor took the key, as the window handlers they
// replaced did
export const DEFAULT_KEYBINDINGS: DefaultKeybinding[] = [
	// Cmd on macOS, Ctrl elsewhere: Ctrl+K on macOS is emacs kill-line, which CodeMirror binds there
	{ command: 'palette.open', key: 'mod+k', late: true },
	// VS Code's chord, for the muscle memory it comes with
	{ command: 'palette.open', key: 'mod+shift+p', late: true },
	{ command: 'palette.goToFile', key: 'mod+t', late: true },
	{ command: 'window.new', key: 'mod+shift+n', late: true },
	{ command: 'file.save', key: 'mod+s', late: true },
	{ command: 'file.openFolder', key: 'mod+o', when: `!terminalFocus && ${NOT_VIM}`, late: true },
	{ command: 'file.preferences', key: 'mod+,', late: true },
	{ command: 'tab.close', key: 'mod+w', when: NOT_VIM, late: true },
	{ command: 'tab.reopen', key: 'mod+shift+t', late: true },
	{ command: 'tab.next', key: 'ctrl+tab', late: true },
	{ command: 'tab.previous', key: 'ctrl+shift+tab', late: true },
	{ command: 'view.focusEditor1', key: 'mod+1', late: true },
	{ command: 'view.focusEditor2', key: 'mod+2', late: true },
	{ command: 'view.focusEditor3', key: 'mod+3', late: true },
	{ command: 'view.focusEditor4', key: 'mod+4', late: true },
	...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ command: `start.openRecent${n}`, key: `mod+${n}` })),
	// the editors and the file tree undo themselves; from anywhere else these reach the open document, as the Edit
	// menu does
	{ command: 'edit.undo', key: 'mod+z', when: '!textInputFocus && !dialogFocus', late: true },
	{ command: 'edit.redo', key: 'mod+y', mac: 'mod+shift+z', when: '!textInputFocus && !dialogFocus', late: true },
	{ command: 'edit.redo', key: 'mod+shift+z', when: '!textInputFocus && !dialogFocus', late: true },
	{ command: 'view.findInFiles', key: 'mod+shift+f', args: { toggle: true }, late: true },
	{ command: 'pdf.find', key: 'mod+f', when: '!textInputFocus', late: true },
	// Ctrl on macOS too, as in VS Code: Cmd+Shift+G stays find previous there. Before the source editor, which would
	// take it as find previous (still on Shift+F3 and Shift+Enter)
	{ command: 'view.sourceControl', key: 'ctrl+shift+g' },
	{ command: 'view.zoomIn', key: 'mod+=', late: true },
	{ command: 'view.zoomIn', key: 'mod+shift+=', late: true },
	{ command: 'view.zoomOut', key: 'mod+-', late: true },
	{ command: 'view.zoomReset', key: 'mod+0', late: true },
	// was Mod+Alt+B, LaTeX Workshop's build chord, but Option+B is a dead key on macOS
	{ command: 'compile.run', key: 'mod+alt+enter', late: true },
	{ command: 'compile.stop', key: 'mod+alt+enter', late: true },
	{ command: 'editor.zoteroCitation', key: 'alt+z', when: '!inputFocus && !terminalFocus', late: true },
	...EDITOR_KEYBINDINGS
];
