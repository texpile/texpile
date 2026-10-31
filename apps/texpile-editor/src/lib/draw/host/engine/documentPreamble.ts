import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { textNow } from '$lib/buffers/textNow';
import { documentMainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { relativeInside } from '$lib/workspace/fileSystem';
import { inputOf, settingsIn } from './bodySettings';

/** the preamble, and the body's settings between `\begin{document}` and `to` */
function setUpTo(text: string, to: number): string | null {
	const wrapper = documentWrapperOf(text);
	if (!wrapper) return null;
	const settings = settingsIn(text, wrapper.begin.to, Math.min(to, wrapper.end?.from ?? text.length));
	return [text.slice(0, wrapper.begin.from), ...settings].join('\n');
}

/** what a picture of the file is drawn under: its own file's preamble and settings, or for a fragment the main file's up
 *  to where it inputs the fragment, then the fragment's own settings before the picture */
export async function documentPreamble(path: string, text: string, picture: number): Promise<string> {
	const own = setUpTo(text, picture);
	if (own !== null) return own;
	const main = documentMainFile();
	const root = workspaceRoot.current;
	const mainText = main ? await textNow(main) : '';
	const fragment = (root && relativeInside(root, path)) ?? path;
	const host = setUpTo(mainText, inputOf(mainText, fragment.replace(/\\/g, '/'))) ?? '';
	return [host, ...settingsIn(text, 0, picture)].join('\n');
}
