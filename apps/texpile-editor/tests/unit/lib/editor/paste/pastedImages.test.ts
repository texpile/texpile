// @vitest-environment jsdom
// Which pasted pictures a file can keep: one the clipboard holds, one a Markdown file links to on the
// web, and a path of the file's own, a Windows drive included; never a web link in LaTeX.
import { describe, expect, it } from 'vitest';
import { Fragment, Slice, type Schema } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { imagePluginKey } from '$lib/editor/visual/extensions/image/imagepluginutils';
import { sliceWithKeptImages, type PasteDialect } from '$lib/editor/paste/pastedImages';
import { pasteMarkdownSource, visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { settings } from '$lib/settings';

const SOURCES = ['data:image/png;base64,AAAA', 'https://example.org/a.png', 'C:/figures/b.png', 'images/c.png'];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// jsdom has no ClipboardEvent, which ProseMirror's paste makes for its handlers
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

/** a Markdown file already showing the clipboard's picture inline, as a data: URL */
function withPicture(uploadFile: (file: File) => Promise<string>): EditorView {
	const doc = mdSchema.node('doc', null, [
		mdSchema.nodes.image.create({ src: PNG }),
		mdSchema.node('paragraph', null, [mdSchema.text('after')])
	]);
	const images = new Plugin({ key: imagePluginKey, settings: { uploadFile } });
	const state = EditorState.create({
		doc,
		plugins: [history(), visualSmartPaste('markdown', mdSchema, pasteMarkdownSource), images],
		selection: TextSelection.atEnd(doc)
	});
	return new EditorView(document.createElement('div'), { state });
}

function sources(view: EditorView): string[] {
	const out: string[] = [];
	view.state.doc.descendants((node) => void (node.type.name === 'image' && out.push(node.attrs.src)));
	return out;
}

function pasteEvent(html: string, text: string): ClipboardEvent {
	const clipboardData = { getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : '') };
	return Object.assign(new Event('paste'), { clipboardData }) as unknown as ClipboardEvent;
}

const saving = () => new Promise((resolve) => setTimeout(resolve));

function keptSources(target: Schema, dialect: PasteDialect, canSave: boolean): string[] {
	const images = SOURCES.map((src) => target.nodes.image.create({ src }));
	const kept = sliceWithKeptImages(new Slice(Fragment.from(images), 0, 0), dialect, canSave);
	const out: string[] = [];
	kept.content.forEach((node) => out.push(node.attrs.src));
	return out;
}

describe('pasted pictures', () => {
	it('keeps what the file can show, and a web picture only in Markdown', () => {
		expect(keptSources(schema, 'latex', true)).toEqual(['data:image/png;base64,AAAA', 'C:/figures/b.png', 'images/c.png']);
		expect(keptSources(schema, 'latex', false)).toEqual(['C:/figures/b.png', 'images/c.png']);
		expect(keptSources(mdSchema, 'markdown', false)).toEqual(['https://example.org/a.png', 'C:/figures/b.png', 'images/c.png']);
	});

	it('saves the picture a paste from another app put in, and only that one', async () => {
		const saved = withPicture(async () => 'images/pasted.png');
		saved.pasteHTML(`<p>See</p><img src="${PNG}"><p>it</p>`);
		await saving();
		expect(sources(saved)).toEqual([PNG, 'images/pasted.png']);
		const failed = withPicture(() => Promise.reject(new Error('disk full')));
		failed.pasteHTML(`<p>See</p><img src="${PNG}"><p>it</p>`);
		await saving();
		expect(sources(failed)).toEqual([PNG]);
		undo(failed.state, failed.dispatch);
		expect(sources(failed)).toEqual([PNG]);
	});

	it('writes no file for a copy inside Texpile, or for a paste that goes in as plain text', async () => {
		const written: File[] = [];
		const view = withPicture(async (file) => (written.push(file), 'images/pasted.png'));
		view.pasteHTML(`<p data-texpile-copy="">See</p><img src="${PNG}"><p>it</p>`);
		settings.current = { ...settings.current, smartPaste: false };
		try {
			const html = `<p>A picture</p><img src="${PNG}">`;
			view.pasteHTML(html, pasteEvent(html, 'A picture'));
		} finally {
			settings.current = { ...settings.current, smartPaste: true };
		}
		await saving();
		expect(written).toEqual([]);
		expect(sources(view)).toEqual([PNG, PNG]);
	});
});
