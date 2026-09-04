// The icons a page's front matter can name. An explicit map, because a namespace import of
// @lucide/svelte cannot be tree-shaken and would ship every icon.
import type { Icon } from '@lucide/svelte';
import BookMarked from '@lucide/svelte/icons/book-marked';
import Bot from '@lucide/svelte/icons/bot';
import BoxSelect from '@lucide/svelte/icons/box-select';
import Code from '@lucide/svelte/icons/code';
import Eye from '@lucide/svelte/icons/eye';
import Files from '@lucide/svelte/icons/files';
import FileText from '@lucide/svelte/icons/file-text';
import GitBranch from '@lucide/svelte/icons/git-branch';
import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download';
import Image from '@lucide/svelte/icons/image';
import Keyboard from '@lucide/svelte/icons/keyboard';
import Layers from '@lucide/svelte/icons/layers';
import Library from '@lucide/svelte/icons/library';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Palette from '@lucide/svelte/icons/palette';
import PenLine from '@lucide/svelte/icons/pen-line';
import Play from '@lucide/svelte/icons/play';
import Plug from '@lucide/svelte/icons/plug';
import Rocket from '@lucide/svelte/icons/rocket';
import Settings from '@lucide/svelte/icons/settings';
import Sigma from '@lucide/svelte/icons/sigma';
import Sparkles from '@lucide/svelte/icons/sparkles';
import SpellCheck from '@lucide/svelte/icons/spell-check';
import Table from '@lucide/svelte/icons/table';
import Type from '@lucide/svelte/icons/type';
import Users from '@lucide/svelte/icons/users';

export const ICONS: Record<string, typeof Icon> = {
	'book-marked': BookMarked,
	bot: Bot,
	'box-select': BoxSelect,
	code: Code,
	eye: Eye,
	files: Files,
	'file-text': FileText,
	'git-branch': GitBranch,
	'hard-drive-download': HardDriveDownload,
	image: Image,
	keyboard: Keyboard,
	layers: Layers,
	library: Library,
	'message-square': MessageSquare,
	palette: Palette,
	'pen-line': PenLine,
	play: Play,
	plug: Plug,
	rocket: Rocket,
	settings: Settings,
	sigma: Sigma,
	sparkles: Sparkles,
	'spell-check': SpellCheck,
	table: Table,
	type: Type,
	users: Users
};
