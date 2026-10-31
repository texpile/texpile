import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { textNow } from '$lib/buffers/textNow';
import { documentMainFile } from '$lib/workspace/workspaceStore';

function preambleOf(text: string): string | null {
	const wrapper = documentWrapperOf(text);
	return wrapper ? text.slice(0, wrapper.begin.from) : null;
}

/** what a picture of the file is drawn under: the file's own preamble, or the main file's for a fragment it inputs */
export async function documentPreamble(text: string): Promise<string> {
	const own = preambleOf(text);
	if (own !== null) return own;
	const main = documentMainFile();
	return (main && preambleOf(await textNow(main))) ?? '';
}
