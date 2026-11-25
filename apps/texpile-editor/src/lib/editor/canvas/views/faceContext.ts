// what a face's build() is handed (8.1): its place, its decorations, the settings and the drawn media it can ask for
import { DOMSerializer, type Fragment as PMFragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Decoration, DecorationSource } from 'prosemirror-view';
import type { DocumentCounters, FaceBuildContext, FaceQueryContext } from '../contracts/faceTypes';
import type { FaceInputKey } from '../contracts/invalidationTypes';
import type { CanvasBuildHelpers, NodeEstimates } from '../contracts/nodeViewTypes';
import { serializeFaceFragment } from '../tree/faceDocument';
import { FaceElement, faceElement } from '../tree/faceElement';
import { formulaElement } from '../math/mathReplaced';
import { checkboxContent } from '../paint/media/checkboxPaint';
import { iconContent } from '../paint/media/iconPaths';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FACES_EPOCH: FaceInputKey = { kind: 'epoch', name: 'faces' };

/** the drawn content W5 (icons, checkboxes), W6 (bitmaps), W7 (formulas) and W10 (overlay slots) fill in */
export type FaceMedia = Pick<FaceBuildContext, 'bitmap' | 'math' | 'icon' | 'checkbox' | 'overlaySlot'>;

/** what stays the same for every face built in one block */
export type FaceBuildScope = FaceQueryContext & {
	readonly schema: Schema;
	readonly counters: DocumentCounters;
	readonly media: FaceMedia;
	/** notes an input the block's faces read, for invalidation (8.5) */
	record(key: FaceInputKey): void;
};

/** the elements alone, as the DOM editor's stand-ins were; each package replaces its own */
export const PLAIN_FACE_MEDIA: FaceMedia = {
	bitmap: () => 'loading',
	math: formulaElement,
	icon(name, size) {
		const el = new FaceElement('svg', SVG_NAMESPACE);
		el.setAttribute('class', `lucide lucide-${name}`);
		el.setAttribute('width', String(size));
		el.setAttribute('height', String(size));
		el.replaced = iconContent(name, size);
		return el;
	},
	checkbox(checked) {
		const el = faceElement('input');
		el.setAttribute('type', 'checkbox');
		el.toggleAttribute('checked', checked);
		el.replaced = checkboxContent(checked);
		return el;
	},
	overlaySlot(name) {
		const el = faceElement('div');
		el.setAttribute('data-overlay-slot', name);
		return el;
	}
};

/** where a view's face scopes read the props, the state and the settings they hand a face */
export type FaceScopeSource = {
	readonly view: FaceQueryContext['view'];
	readonly media: FaceMedia;
	props(): { readonly language: FaceQueryContext['language']; readonly nodeEstimates?: NodeEstimates };
	editable(): boolean;
	schema(): Schema;
	settings(): FaceQueryContext['settings'];
};

/** a view's query context, the build scope of one block, and a node's own estimate for a block never laid out */
export function faceScopesOf(source: FaceScopeSource) {
	function query(): FaceQueryContext {
		return { view: source.view, language: source.props().language, editable: source.editable(), settings: source.settings() };
	}
	return {
		query,
		build: (record: (key: FaceInputKey) => void, counters: DocumentCounters): FaceBuildScope => ({
			...query(),
			schema: source.schema(),
			counters,
			media: source.media,
			record
		}),
		estimate(node: PMNode, width: number): number | null {
			return source.props().nodeEstimates?.[node.type.name]?.(node, width, source.view) ?? null;
		}
	};
}

const serializers = new WeakMap<Schema, DOMSerializer>();

function serializerOf(schema: Schema): DOMSerializer {
	let serializer = serializers.get(schema);
	if (!serializer) serializers.set(schema, (serializer = DOMSerializer.fromSchema(schema)));
	return serializer;
}

/** what view.canvas.build answers while a block's views build */
export function buildHelpersOf(scope: FaceBuildScope): CanvasBuildHelpers {
	return {
		counters: scope.counters,
		/** a view that reads a setting builds again when the settings change (8.6) */
		get settings() {
			scope.record(FACES_EPOCH);
			return scope.settings;
		},
		el: faceElement,
		read(key, value) {
			scope.record(key);
			return value();
		},
		serializeFragment(fragment: PMFragment, inline: boolean) {
			const host = faceElement(inline ? 'span' : 'div');
			host.appendChild(serializeFaceFragment(serializerOf(scope.schema), fragment));
			return host;
		},
		...scope.media
	};
}

/** a face's build context from the helpers of the build it runs in */
export function faceBuildContext(
	query: Pick<FaceQueryContext, 'view' | 'language' | 'editable'>,
	tools: CanvasBuildHelpers,
	place: { pos(): number; decorations: readonly Decoration[]; inner: DecorationSource }
): FaceBuildContext {
	return {
		view: query.view,
		language: query.language,
		editable: query.editable,
		get settings() {
			return tools.settings;
		},
		counters: tools.counters,
		pos: place.pos,
		decorations: place.decorations,
		inner: place.inner,
		el: tools.el,
		read: tools.read,
		serializeFragment: tools.serializeFragment,
		bitmap: tools.bitmap,
		math: tools.math,
		icon: tools.icon,
		checkbox: tools.checkbox,
		overlaySlot: tools.overlaySlot
	};
}

export function createFaceBuildContext(
	scope: FaceBuildScope,
	place: { pos(): number; decorations: readonly Decoration[]; inner: DecorationSource }
): FaceBuildContext {
	return faceBuildContext(scope, buildHelpersOf(scope), place);
}
