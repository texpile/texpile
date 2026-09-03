import { TextSelection, type PluginKey } from 'prosemirror-state';
import type { MathLivePluginState } from './mlplugin';
import { MathfieldElement } from 'mathlive';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import 'mathlive/fonts.css';
import { browser } from '$lib/runtime';
import { mount, unmount } from 'svelte';
import MathSettings from './MathSettings.svelte';
import { configureMathVirtualKeyboard } from './virtualKeyboardConfig';
import { installSuggestionPopoverFlashFix } from './suggestionPopoverFlashFix';
import { syncBlockMathAttrs, isMathLatexEmpty } from './mathEnvironments';
import { renderEquationNumbers } from './equationNumbers';
import { MathFieldExit, applyMathOutline } from './mathFieldExit';
import { buildMathField, releaseMathField, type FieldListeners } from './mathFieldFactory';
import { renderStaticMath, setStaticMath, cancelStaticMath } from './mathStatic';
import { upgradeWhenNear, cancelUpgrade } from './mathViewport';
import { mathMacros } from './mathMacros.svelte';
import { observe } from '$lib/runes/observe.svelte';

// reactive props stashed on the container so update() can reach the mounted component without a registry.
type SettingsHost = {
	__svelteComponentProps?: { node: Node; view: EditorView; getPos: () => number | undefined };
} & HTMLElement;

if (browser) {
	MathfieldElement.soundsDirectory = null;
	configureMathVirtualKeyboard();
	installSuggestionPopoverFlashFix();
}
export class MathLiveView implements NodeView {
	dom: HTMLElement;
	/** undefined until materialize() runs; see the placeholder note there */
	mathField?: MathfieldElement;
	node: Node;
	updating: boolean;
	/** static typeset standing in for the field until this node comes near the viewport */
	private placeholder?: HTMLElement;
	private mlpluginkey: PluginKey<MathLivePluginState>;
	private origFocus?: (options?: FocusOptions) => void;
	private settingsContainer?: HTMLElement;
	private settingsComponent?: ReturnType<typeof mount>;
	private unwatchMacros?: () => void;
	private macrosApplied = false;
	private isblock: boolean;
	// no user input yet: skip auto-delete on first blur (focus race when created via shortcut)
	private isNewlyCreated: boolean = true;
	private exit: MathFieldExit;
	private equationNumbersContainer?: HTMLElement;

	constructor(
		node: Node,
		private view: EditorView,
		private getPos: () => number,
		mlpluginkey: PluginKey<MathLivePluginState>,
		isblock: boolean = false
	) {
		this.mlpluginkey = mlpluginkey;
		this.isblock = isblock;
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.exit = new MathFieldExit({
			view,
			getPos: () => this.getPos(),
			node: () => this.node,
			host: () => this.host,
			isEmpty: () => this.isMathfieldEmpty(),
			deselect: () => this.deselectNode()
		});
		if (isblock) {
			this.dom = document.createElement('div');
			this.dom.className = 'block-math-container';
			this.dom.style.display = 'flex';
			this.dom.style.justifyContent = 'center';
			this.dom.style.position = 'relative';
			this.dom.style.alignItems = 'center';

			this.syncBlockDomAttrs(node);

			this.equationNumbersContainer = document.createElement('div');
			this.equationNumbersContainer.className = 'equation-numbers';
			this.dom.appendChild(this.equationNumbersContainer);
			this.updateEquationNumbers();
		} else {
			this.dom = document.createElement('span');
		}

		// A MathfieldElement is a full editor - shadow DOM, selection model, undo stack, virtual
		// keyboard - and measures ~7 ms to build. A document with a thousand of them spends that a
		// thousand times at load for math the reader cannot even see yet. Start with a static typeset
		// instead (~0.4 ms, and correctly sized so nothing reflows later) and build the real field when
		// the node nears the viewport, or the moment the caret arrives.
		this.placeholder = renderStaticMath(node.textContent || '', isblock);
		this.dom.appendChild(this.placeholder);

		if (isblock) {
			this.settingsContainer = document.createElement('div');
			this.dom.appendChild(this.settingsContainer);
			// The settings button is opacity:0 until the block is hovered or focused, so mounting the
			// component here costs a whole Svelte component per equation for something nobody can see
			// yet. Defer it to the first hover or focus: a document with 262 equations skips 262 mounts
			// at load and pays for exactly the ones the user reaches for.
			this.dom.addEventListener('pointerenter', this.mountSettings);
			this.dom.addEventListener('focusin', this.mountSettings);
		}

		this.updating = false;

		this.forwardupdate = this.forwardupdate.bind(this);
		this.mlkeymap = this.mlkeymap.bind(this);
		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);
		this.keydown = this.keydown.bind(this);

		// use node.textContent, getValue() may not be ready yet
		const initialValue = node.textContent || '';
		const isEmpty = initialValue.trim().length === 0;
		if (isEmpty) {
			this.placeholder.style.border = '1px solid var(--color-error-500)';
			this.placeholder.style.outline = 'none';
		}

		upgradeWhenNear(this.dom, this.materialize);
		// a \newcommand edited in the preamble changes what this equation reads as; the static
		// placeholders are re-typeset centrally, a live field has to be told
		this.unwatchMacros = observe(
			() => mathMacros.current,
			() => this.applyMacros()
		);
	}

	/**
	 * Applies the document's macros and re-parses the source against them.
	 *
	 * Only ever on a field that is IN the document: mathlive throws "Mathfield not mounted" from
	 * the macros getter otherwise, which is why the factory cannot do this at build time. Skipped
	 * when there is nothing to add, so a document without \newcommand pays no second setValue.
	 * Silenced: this is the same formula rendered again, not an edit, and a notification would
	 * write it back to the document.
	 */
	private applyMacros(): void {
		if (!this.mathField?.isConnected) return;
		const macros = mathMacros.current;
		if (Object.keys(macros).length === 0 && !this.macrosApplied) return;
		this.macrosApplied = true;
		this.mathField.macros = { ...this.mathField.macros, ...macros };
		this.mathField.setValue(this.node.textContent || '', { format: 'latex-expanded', silenceNotifications: true });
	}

	/** the element currently standing in for this node: the live field once there is one */
	private get host(): HTMLElement {
		return this.mathField ?? (this.placeholder as HTMLElement);
	}

	// data attrs drive CSS counters and multi-line styling
	private syncBlockDomAttrs(node: Node): void {
		this.dom.setAttribute('data-label', node.attrs.label || '');
		this.dom.setAttribute('data-numbered', node.attrs.numbered ? 'true' : 'false');
		this.dom.setAttribute('data-environment', node.attrs.environment || '');
		const lineCount = (node.attrs.lineLabels as string[])?.length || 1;
		this.dom.setAttribute('data-line-count', String(lineCount));
		// typst has no live "(1)" (numbering is the template's #set rule), so a labeled
		// equation shows its <label> where LaTeX shows the number - visible proof that it
		// exists and is what @ offers (CSS in TypstEditorView). Optional chain: test fakes
		// construct this view without a full state.
		if (this.view.state?.schema?.nodes.typ_ref) this.dom.setAttribute('data-typst-label', node.attrs.label || '');
	}

	/** the listener set handed to buildMathField, and to releaseMathField in destroy() */
	private fieldListeners(): FieldListeners {
		return { input: this.forwardupdate, moveOut: this.mlkeymap, focus: this.handleFocus, blur: this.handleBlur, keydown: this.keydown };
	}

	/** Replaces the static placeholder with a real MathfieldElement. Runs when the node nears the
	 * viewport, or immediately when the caret arrives first. One-way and idempotent: a field is never
	 * torn back down, so nothing can lose selection or a half-typed formula. */
	private materialize = (): void => {
		if (this.mathField) return;

		// this.node, not the constructor's node: edits can land while the placeholder is still up
		const { field, origFocus } = buildMathField(this.node.textContent || '', this.view.editable, this.fieldListeners());
		this.mathField = field;
		this.origFocus = origFocus;

		if (this.placeholder) {
			cancelStaticMath(this.placeholder); // no point typesetting something about to be replaced
			this.dom.replaceChild(field, this.placeholder);
			this.placeholder = undefined;
		} else {
			this.dom.appendChild(field);
		}

		// the field is in the document now, which is the earliest mathlive will accept macros
		this.applyMacros();

		this.removeSelection();
		this.updateOutline(false);
	};

	/** Builds the settings popover on first hover or focus, then unhooks itself. An arrow field so the
	 * same reference can be removed later. Keyboard reach is preserved because focusing the mathfield
	 * fires focusin on the container, mounting the button before Tab can move to it. */
	private mountSettings = (): void => {
		if (this.settingsComponent || !this.settingsContainer) return;

		const componentProps = $state({
			node: this.node,
			view: this.view,
			getPos: this.getPos
		});

		this.settingsComponent = mount(MathSettings, {
			target: this.settingsContainer,
			props: componentProps
		});

		(this.settingsContainer as SettingsHost).__svelteComponentProps = componentProps;

		this.dom.removeEventListener('pointerenter', this.mountSettings);
		this.dom.removeEventListener('focusin', this.mountSettings);
	};

	/** per-line envs (align, gather) get JS-rendered line numbers, single-label ones use CSS ::after. */
	private updateEquationNumbers() {
		if (!this.equationNumbersContainer) return;
		renderEquationNumbers(this.view, this.node, this.dom, this.equationNumbersContainer, this.getPos());
	}

	handleFocus() {
		this.updateOutline(true);
	}
	handleBlur() {
		const isEmpty = this.isMathfieldEmpty();

		if (isEmpty && (this.exit.pendingDelete || !this.isNewlyCreated)) {
			try {
				const pos = this.getPos();
				const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize);
				// don't force a selection, respect the user's click destination
				this.view.dispatch(tr);
			} catch (_e) {
				// getPos may be invalid if the node is already removed; ignore
			}
			return;
		}

		this.exit.pendingDelete = false;

		this.updateOutline(false);
		this.removeSelection();
	}

	private updateOutline(focus: boolean) {
		const isEmpty = this.isMathfieldEmpty();
		if (!isEmpty) this.exit.pendingDelete = false;
		applyMathOutline(this.host, isEmpty, this.exit.pendingDelete, focus);
	}

	forwardupdate() {
		const field = this.mathField;
		// only ever reached from the field's own listeners, so this is a type guard, not a case
		if (!field) return;
		// hasFocus(), not hasFocus: the method reference is always truthy, so this guard never fired and
		// every input event was treated as the user typing. MathLive emits one asynchronously after the
		// setValue() in update(), by which point `updating` has already been cleared by its rAF - so a
		// field that merely re-rendered would write its normalized latex back into the document and
		// move the selection inside itself, stealing focus from wherever the caret actually was.
		if (this.updating || !field.hasFocus()) return;

		this.isNewlyCreated = false;

		if (!this.isMathfieldEmpty() && this.exit.pendingDelete) {
			this.exit.pendingDelete = false;
			field.style.backgroundColor = 'transparent';
		}

		const currentContent = this.node.textContent || '';
		const newValue = field.getValue('latex-expanded');
		if (currentContent !== newValue) {
			const startPos = this.getPos();
			const endPos = startPos + this.node.nodeSize;

			this.updating = true;
			if (newValue.length) {
				const tr = this.view.state.tr;
				const nodeType = this.node.type;

				// block math: re-detect the multiline env from the new content and sync attrs
				const newAttrs = this.isblock ? syncBlockMathAttrs(this.node, newValue) : { ...this.node.attrs };

				tr.replaceWith(startPos, endPos, nodeType.create(newAttrs, this.view.state.schema.text(newValue)));
				tr.setSelection(TextSelection.create(tr.doc, startPos + 1));
				this.view.dispatch(tr);
			} else {
				// TODO: Deletion flow when field becomes empty.
			}
			this.updating = false;
		}

		this.updateOutline(field.hasFocus());
	}

	setSelection(anchor: number, head: number) {
		if (!this.updating) return;
		// the caret is arriving, so the real field has to exist now
		this.materialize();
		const field = this.mathField;
		if (!field) return;
		field.focus();
		if (anchor === 0 && head === 0) {
			field.executeCommand('moveToMathfieldStart' as never);
		} else {
			field.executeCommand('moveToMathfieldEnd' as never);
		}
	}

	update(node: Node) {
		if (node.type !== this.node.type) return false;
		this.node = node;
		if (this.updating) return true;

		// while focused, trust mathlive: stale PM content could clobber typing during the
		// rAF window before the updating flag clears. next forwardupdate() re-syncs.
		if (this.mathField?.hasFocus()) return true;

		const newText = node.textContent || '';

		if (!this.mathField) {
			// still a placeholder: re-typeset it so an offscreen edit (undo, collaborator, disk
			// reload) is reflected, and so the node keeps the right size for the scrollbar
			if (this.placeholder) setStaticMath(this.placeholder, newText);
		} else {
			// compare expanded latex, same as forwardupdate()
			const currentText = this.mathField.getValue('latex-expanded');

			if (newText != currentText) {
				this.updating = true;
				this.mathField.setValue(newText, {
					format: 'latex-expanded'
				});
				// mathlive fires an async input event after setValue, keep updating set until it lands
				requestAnimationFrame(() => {
					this.updating = false;
				});
			}
		}

		if (this.isblock) {
			this.syncBlockDomAttrs(node);
			this.updateEquationNumbers();
		}

		if (this.isblock && this.settingsContainer) {
			const existingProps = (this.settingsContainer as SettingsHost).__svelteComponentProps;
			if (existingProps) {
				existingProps.node = node;
			}
		}

		this.updateOutline(this.mathField?.hasFocus() ?? false);
		return true;
	}

	mlkeymap(event: CustomEvent<{ direction: string }>) {
		event.preventDefault();
		this.exit.maybeEscape(event.detail.direction);
	}

	/** empty including wrapper-only content like \begin{align} & \end{align}. */
	private isMathfieldEmpty(): boolean {
		// before materialize() the node's own text is the source of truth; the field has not been
		// built to ask, and it would hold exactly this anyway
		return isMathLatexEmpty(this.mathField ? this.mathField.getValue('latex-expanded') : this.node.textContent || '');
	}

	keydown(event: KeyboardEvent) {
		const field = this.mathField;
		if (!field) return; // a key event means the field exists; this is a type guard
		this.exit.keydown(event, field);
	}

	stopEvent() {
		// Once the field exists mathlive owns everything inside it. While the placeholder is up there
		// is nothing to own the events, so let ProseMirror handle the click: it sets a NodeSelection,
		// which calls selectNode(), which materializes the field and focuses it.
		return this.mathField !== undefined;
	}

	selectNode() {
		// the caret is arriving, so build the field regardless of where the viewport is
		this.materialize();
		const field = this.mathField;
		if (!field) return;

		const maybePos = this.mlpluginkey.getState(this.view.state)?.prevCursorPos;

		field.focus();

		// enter from the side the cursor approached from
		const nodeStart = this.getPos();
		if (maybePos === undefined || maybePos <= nodeStart) {
			field.executeCommand('moveToMathfieldStart' as never);
		} else {
			field.executeCommand('moveToMathfieldEnd' as never);
		}
	}

	removeSelection() {
		if (!this.mathField) return;
		this.mathField.selection = { ranges: [[0, 0]] };
	}

	deselectNode() {
		if (this.updating) {
			return;
		}
		this.removeSelection();
		this.mathField?.blur();
		this.updateOutline(false);
	}
	destroy() {
		this.unwatchMacros?.();
		cancelUpgrade(this.dom);
		if (this.placeholder) cancelStaticMath(this.placeholder);
		if (this.mathField) {
			releaseMathField(this.mathField, this.origFocus, this.fieldListeners());
			this.origFocus = undefined;
		}
		if (this.isblock) {
			// harmless when mountSettings already removed them
			this.dom.removeEventListener('pointerenter', this.mountSettings);
			this.dom.removeEventListener('focusin', this.mountSettings);
		}
		if (this.settingsComponent) {
			unmount(this.settingsComponent);
		}
	}
}
