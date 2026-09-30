// Paste and Paste Without Formatting for the visual editors' menu and Mod+Shift+V, which have no
// paste event of their own and read the clipboard instead.
import type { EditorView } from 'prosemirror-view';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

type ClipboardText = { html: string; text: string; hasImage: boolean };

async function readClipboardText(): Promise<ClipboardText> {
	const read: ClipboardText = { html: '', text: '', hasImage: false };
	for (const item of await navigator.clipboard.read()) {
		if (!read.html && item.types.includes('text/html')) read.html = await (await item.getType('text/html')).text();
		if (!read.text && item.types.includes('text/plain')) read.text = await (await item.getType('text/plain')).text();
		if (item.types.some((type) => type.startsWith('image/'))) read.hasImage = true;
	}
	return read;
}

function warnUnreadable(): void {
	toaster.warning({ title: m.ctxmenu_paste_read_failed_toast(), duration: 3000 });
}

/** the clipboard pasted as Ctrl+V pastes it: the editors' paste handlers see the same clipboard data */
export async function pasteFromClipboard(view: EditorView): Promise<void> {
	const read = await readClipboardText().catch(() => null);
	if (!read) return warnUnreadable();
	if (!read.html && !read.text) {
		if (read.hasImage) toaster.warning({ title: m.ctxmenu_paste_images_hint_toast(), duration: 3000 });
		return;
	}
	const clipboardData = new DataTransfer();
	if (read.html) clipboardData.setData('text/html', read.html);
	if (read.text) clipboardData.setData('text/plain', read.text);
	const event = new ClipboardEvent('paste', { clipboardData });
	if (read.html) view.pasteHTML(read.html, event);
	else view.pasteText(read.text, event);
}

/** the clipboard's plain text, taken literally: no formatting, and no LaTeX, Typst or Markdown read into it */
export async function pasteWithoutFormatting(view: EditorView): Promise<void> {
	const read = await readClipboardText().catch(() => null);
	if (!read) return warnUnreadable();
	const text = read.text || new DOMParser().parseFromString(read.html, 'text/html').body.textContent || '';
	// no clipboard data on the event, so the paste handlers that read one stand aside
	if (text) view.pasteText(text);
}
