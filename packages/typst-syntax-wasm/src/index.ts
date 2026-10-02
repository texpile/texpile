// A Lezer Parser backed by Typst's own parser, compiled to wasm (see ../src/lib.rs).
//
// The wasm hands back ONE flat Uint32Array per parse in Lezer's documented `Tree.build` buffer
// format, so every parse produces a fresh, immutable Tree through the supported constructor. That
// is the whole reason this exists rather than codemirror-lang-typst, which reinterprets the wasm's
// output object as a Tree and then mutates it in place — trees are shared between editor states,
// and a mutated one describes a document its own state no longer contains.
import { NodeSet, NodeType, Parser, Tree } from '@lezer/common';
import type { Input, NodePropSource, PartialParse, TreeFragment } from '@lezer/common';
import { TypstSyntax } from '../pkg/texpile_typst_syntax_wasm.js';

export { typstHighlight } from './highlight.js';
export { parseTypstMath, hasTypstError, type TypstMathNode } from './mathTree.js';

export class TypstParser extends Parser {
	/** the wasm parser, kept across parses so Source::replace can reparse incrementally */
	private syntax: TypstSyntax | null = null;
	private nodeSet: NodeSet;
	/** how many node types nodeSet currently covers; the wasm table only ever grows */
	private known = 0;
	private topType: NodeType;

	private readonly props: readonly NodePropSource[];

	/**
	 * `props` are the NodeProp sources to hang on every node type — a styleTags map for
	 * highlighting, a foldNodeProp for folding, and so on. Variadic because those come from
	 * different layers: highlighting is a Lezer concern this package can supply itself, while
	 * folding is a CodeMirror one and belongs to whoever is embedding the editor.
	 */
	constructor(...props: NodePropSource[]) {
		super();
		this.props = props;
		// index 0 is Lezer's NodeType.none, by contract
		this.nodeSet = new NodeSet([NodeType.none]);
		this.topType = NodeType.none;
	}

	/**
	 * Grow the NodeSet to cover every type the wasm has named so far.
	 *
	 * Ids are stable for the parser's lifetime (the Rust side never renumbers), so extending is
	 * always additive and trees built against an earlier, shorter set stay valid.
	 */
	private syncNodeSet(syntax: TypstSyntax): void {
		const names = syntax.node_names();
		const list = names ? names.split('\n') : [];
		if (list.length === this.known && this.topType !== NodeType.none) return;
		// Slot 0 is the TOP type, not NodeType.none: Tree.build resolves topID 0 through this
		// array, and a `none` top gives every tree a typeless root — which silently breaks
		// anything keyed on the top node's props, most visibly languageDataAt (commentTokens,
		// so Mod-/) finding no language data at all.
		if (this.topType === NodeType.none) {
			this.topType = NodeType.define({ name: syntax.top_name(), id: 0, top: true });
		}
		const types: NodeType[] = [this.topType];
		list.forEach((name, i) => {
			types.push(NodeType.define({ name, id: i + 1, top: false }));
		});
		this.nodeSet = new NodeSet(types).extend(...this.props);
		this.known = list.length;
	}

	/** Drop all parser state. Required when the editor's document is replaced wholesale. */
	reset(): void {
		this.syntax?.free();
		this.syntax = null;
		this.known = 0;
		this.nodeSet = new NodeSet([NodeType.none]);
	}

	private parseText(text: string): Tree {
		if (!this.syntax) {
			this.syntax = new TypstSyntax(text);
		} else {
			// Source::replace diffs old against new down to a single edit and reparses only that,
			// which is why this class needs no change tracking of its own. Handing it the whole text
			// each time is what makes desync structurally impossible.
			this.syntax.set_text(text);
		}
		const buffer = this.syntax.buffer();
		this.syncNodeSet(this.syntax);
		return Tree.build({
			buffer: Array.from(buffer),
			nodeSet: this.nodeSet,
			topID: 0,
			length: text.length
		});
	}

	createParse(input: Input, _fragments: readonly TreeFragment[], ranges: readonly { from: number; to: number }[]): PartialParse {
		// Fragments are deliberately ignored: reuse happens inside Typst's own reparser, keyed on
		// the text, not on Lezer's fragment bookkeeping. Mixing the two would mean two independent
		// notions of "what changed" that have to agree.
		const to = ranges.length ? ranges[ranges.length - 1].to : input.length;
		const text = input.read(0, to);
		let done = false;
		const self = this;
		return {
			get parsedPos() {
				return done ? to : 0;
			},
			stoppedAt: null,
			stopAt() {
				/* the parse is atomic: there is no partial state to stop in */
			},
			advance(): Tree | null {
				if (done) return null;
				done = true;
				return self.parseText(text);
			}
		};
	}
}
