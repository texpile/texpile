// import updateImageNode DIRECTLY, not through the image barrel: the barrel pulls in
// imageplugin.svelte (Svelte + document at module load), fatal for the parser Web Worker
import { updateImageNode, type SchemaImageSettings } from '$lib/editor/visual/extensions/image/updateImageNode';
import { Schema } from 'prosemirror-model';
import { baseMarks as marks } from '$lib/editor/visual/schema/basePMSchema';
import { coreNodes } from './pmSchemaNodes';
import { latexDocumentPlugins } from '../visual/latexDocumentPlugins';

// built by hand instead of the imageplugin.svelte settings creators (which pull in the DOM, fatal for the worker).
// must stay in sync with the runtime plugin settings: omitting isBlock once silently flipped the
// image node to inline while the converter emitted block figures, freezing the editor on edit
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null }
};

// the core's nodes, then each plugin's in list order; updateImageNode needs the node present in an OrderedMap
const core = new Schema({ nodes: coreNodes, marks }).spec;
const spec = latexDocumentPlugins.reduce((was, plugin) => plugin.schema?.(was) ?? was, { nodes: core.nodes, marks: core.marks });
// a figure group holds images, which are blocks only from here on
export const schema = new Schema({
	nodes: updateImageNode(spec.nodes, schemaImageSettings),
	marks: spec.marks
});
