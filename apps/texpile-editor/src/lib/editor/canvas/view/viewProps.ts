// the view's props: someProp in prosemirror-view's order, editable, and the attributes on the root and the mirror host
import type { EditorState, Plugin } from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';
import type { CanvasProps } from '../contracts/viewTypes';
import { patchAttributes, type AttributeTarget, type OuterLevel } from '../tree/decorationElements';

const NO_DIRECT_PLUGINS: readonly Plugin[] = [];

type PropValue<K extends keyof EditorProps> = NonNullable<EditorProps[K]>;

export class ViewProps {
	private current: CanvasProps;
	private rootAttributes: OuterLevel = {};

	constructor(props: CanvasProps) {
		this.current = props;
	}

	get props(): CanvasProps {
		return this.current;
	}

	/** the props with the state the view holds now, as prosemirror-view's props getter answers */
	propsFor(state: EditorState): CanvasProps {
		if (this.current.state !== state) this.current = { ...this.current, state };
		return this.current;
	}

	/** returns whether the plugin list, the handleDOMEvents prop or the views changed */
	set(props: Partial<CanvasProps>, state: EditorState): { plugins: boolean; handlers: boolean; views: boolean } {
		const before = this.current;
		this.current = { ...before, ...props, state: props.state ?? state };
		return {
			plugins: this.current.plugins !== before.plugins,
			handlers: this.current.handleDOMEvents !== before.handleDOMEvents,
			views:
				this.current.nodeViews !== before.nodeViews ||
				this.current.markViews !== before.markViews ||
				this.current.nodeEstimates !== before.nodeEstimates
		};
	}

	get directPlugins(): readonly Plugin[] {
		return this.current.plugins ?? NO_DIRECT_PLUGINS;
	}

	/** the constructor props first, then the view's own plugins, then the state's; the first truthy answer wins */
	someProp<K extends keyof EditorProps, R>(name: K, f: ((value: PropValue<K>) => R) | undefined, state: EditorState): R | undefined {
		function take(prop: EditorProps[K]): R | undefined {
			if (prop === undefined || prop === null) return undefined;
			return (f ? f(prop as PropValue<K>) : prop) as R | undefined;
		}
		let value = take((this.current as EditorProps)[name]);
		if (value) return value;
		for (const plugin of this.directPlugins) if ((value = take(plugin.props[name]))) return value;
		for (const plugin of state.plugins) if ((value = take(plugin.props[name]))) return value;
		return undefined;
	}

	/** computeDocDeco: ProseMirror plus every attributes prop, classes added, styles joined, other attributes first wins */
	attributesFor(state: EditorState, someProp: <R>(f: (value: PropValue<'attributes'>) => R) => R | undefined): OuterLevel {
		const attrs: OuterLevel = { class: 'ProseMirror' };
		someProp((value) => {
			const found = typeof value === 'function' ? value(state) : value;
			for (const [name, text] of Object.entries(found ?? {})) {
				if (name === 'class') attrs.class += ` ${text}`;
				else if (name === 'style') attrs.style = attrs.style ? `${attrs.style};${text}` : text;
				else if (!attrs[name] && name !== 'contenteditable' && name !== 'nodeName') attrs[name] = String(text);
			}
			return undefined;
		});
		attrs.translate ??= 'no';
		return attrs;
	}

	/** patches only what the props add, so classes the app toggles itself (page-view, ProseMirror-focused) stay */
	applyAttributes(next: OuterLevel, targets: readonly AttributeTarget[]): void {
		for (const target of targets) patchAttributes(target, this.rootAttributes, next);
		this.rootAttributes = next;
	}
}
