import type { Node, Schema } from 'prosemirror-model';
import type { ImagePluginSettings } from './types';

// schema.ts builds this object by hand (the imageplugin.svelte settings creators pull in svelte/the DOM, which
// breaks the parser worker); the narrowed type makes a forgotten field a compile error, not a silent schema change.
export type SchemaImageSettings = Pick<ImagePluginSettings, 'hasTitle' | 'extraAttributes' | 'isBlock'>;

export function updateImageNode(nodes: Schema['spec']['nodes'], pluginSettings: SchemaImageSettings): typeof nodes {
	const { extraAttributes } = pluginSettings;
	const attributesUpdate = Object.keys(extraAttributes)
		.map((attrKey) => ({
			[attrKey]: {
				default: extraAttributes[attrKey] || null
			}
		}))
		.reduce((acc, curr) => ({ ...acc, ...curr }), {});

	const attributeKeys = [...Object.keys(extraAttributes), 'src', 'alt', 'label', 'numbered', 'showCaption', 'spanning', 'options'];
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return nodes.update('image', {
		...(pluginSettings.hasTitle ? { content: 'inline*' } : {}),
		attrs: {
			src: { default: null },
			alt: { default: null },
			height: { default: null },
			width: { default: null },
			maxWidth: { default: null },
			label: { default: null },
			numbered: { default: true },
			showCaption: { default: true },
			spanning: { default: false },
			// verbatim \includegraphics optional args so parsed size/crop survives.
			// '' = source had no brackets; null = editor-created (default width).
			options: { default: null },
			// verbatim \begin{figure} wrapper with image/caption/label slots; see schema.ts
			figureTemplate: { default: null },
			// bare \includegraphics{...} in the source, no \begin{figure}; see schema.ts
			bareOriginal: { default: false },
			// verbatim \caption[short] optional arg; see schema.ts
			captionOpt: { default: null },
			...attributesUpdate
		},
		atom: true,
		...(pluginSettings.isBlock ? { group: 'block' } : { group: 'inline', inline: true }),
		draggable: true,
		toDOM(node: Node) {
			const toAttributes = attributeKeys
				.map((attrKey) => ({ [`imageplugin-${attrKey}`]: node.attrs[attrKey] }))
				.reduce((acc, curr) => ({ ...acc, ...curr }), {});
			return [
				'div',
				{
					class: `imagePluginRoot`,
					...toAttributes
				},
				...(pluginSettings.hasTitle ? [0] : [])
			];
		},
		parseDOM: [
			{
				tag: 'div.imagePluginRoot',
				getAttrs(dom) {
					if (typeof dom === 'string') return {};
					return attributeKeys
						.map((attrKey) => ({
							[attrKey]: dom.getAttribute(`imageplugin-${attrKey}`)
						}))
						.reduce((acc, curr) => ({ ...acc, ...curr }), {});
				}
			},
			// a picture pasted from another app, which never had a caption; editor/paste decides whether it can stay
			{
				tag: 'img[src]',
				getAttrs(dom) {
					if (typeof dom === 'string') return {};
					return { src: dom.getAttribute('src'), alt: dom.getAttribute('alt') || null, numbered: false, showCaption: false };
				}
			}
		]
	});
}
