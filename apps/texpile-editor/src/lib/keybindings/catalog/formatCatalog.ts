import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.menubar_menu_format();
}

function formatCommand(id: string, title: () => string): CommandInfo {
	return { id: `editor.${id}`, title, category, palette: false };
}

// the editors' own keys: each runs in the source and visual editor of every language that has it
export const FORMAT_COMMANDS: CommandInfo[] = [
	formatCommand('bold', () => m.menubar_format_bold()),
	formatCommand('italic', () => m.menubar_format_italic()),
	formatCommand('underline', () => m.menubar_format_underline()),
	formatCommand('strikethrough', () => m.mdtoolbar_strike()),
	formatCommand('inlineCode', () => m.menubar_format_inline_code()),
	formatCommand('superscript', () => m.menubar_shortcut_superscript()),
	formatCommand('subscript', () => m.menubar_shortcut_subscript()),
	formatCommand('blockquote', () => m.menubar_format_blockquote()),
	formatCommand('codeBlock', () => m.menubar_insert_code_block()),
	formatCommand('heading0', () => m.mdtoolbar_paragraph()),
	...[1, 2, 3, 4, 5, 6].map((n) => formatCommand(`heading${n}`, () => m.mdtoolbar_heading_n({ n }))),
	formatCommand('inlineMath', () => m.menubar_shortcut_inline_math()),
	formatCommand('displayMath', () => m.menubar_shortcut_display_math())
];
