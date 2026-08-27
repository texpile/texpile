// import updateImageNode DIRECTLY, not through the image barrel: the barrel pulls in
// imageplugin.svelte (Svelte + document at module load), fatal for the parser Web Worker
import { updateImageNode, type SchemaImageSettings } from '$lib/editor/visual/extensions/image/updateImageNode';
import { Schema } from 'prosemirror-model';
import { baseMarks as marks } from '$lib/editor/visual/schema/basePMSchema';
import { nodes } from './pmSchemaNodes';

export { nodes, marks };

// built by hand instead of the imageplugin.svelte settings creators (which pull in the DOM, fatal for the worker).
// must stay in sync with the runtime plugin settings: omitting isBlock once silently flipped the
// image node to inline while the converter emitted block figures, freezing the editor on edit
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null }
};

// two-pass: updateImageNode needs the node present in an OrderedMap before it can replace it
const tempschema = new Schema({ nodes, marks });
export const schema = new Schema({
	nodes: updateImageNode(tempschema.spec.nodes, schemaImageSettings),
	marks
});
