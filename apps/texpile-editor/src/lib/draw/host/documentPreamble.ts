import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';

/** what a picture of the file is drawn under: the file's own preamble */
export function documentPreamble(text: string): string {
	const wrapper = documentWrapperOf(text);
	return wrapper ? text.slice(0, wrapper.begin.from) : '';
}
