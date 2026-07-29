import { Selection, TextSelection } from 'prosemirror-state';
import { MathfieldElement } from 'mathlive';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import 'mathlive/fonts.css';
import { setTextSelection } from 'prosemirror-utils';
import { browser } from '$lib/runtime';
import { mount, unmount } from 'svelte';
import MathSettings from './MathSettings.svelte';
import { configureMathVirtualKeyboard } from './virtualKeyboardConfig';
import { generateLabel } from '$lib/editor/utils/label';
import { renderStaticMath, setStaticMath, cancelStaticMath } from './mathStatic';
import { upgradeWhenNear, cancelUpgrade } from './mathViewport';

// reactive props stashed on the container so update() can reach the mounted component without a registry.
interface SettingsHost extends HTMLElement {
	__svelteComponentProps?: { node: Node; view: EditorView; getPos: () => number | undefined };
}

const PER_LINE_ENVIRONMENTS = ['align', 'gather', 'alignat', 'eqnarray'] as const;
const SINGLE_LABEL_ENVIRONMENTS = ['multline'] as const;
const MULTILINE_ENVIRONMENTS = [...PER_LINE_ENVIRONMENTS, ...SINGLE_LABEL_ENVIRONMENTS] as const;
type MultilineEnvironment = (typeof MULTILINE_ENVIRONMENTS)[number];

interface EnvironmentDetection {
	environment: MultilineEnvironment;
	isStarred: boolean; // starred (align*) = unnumbered
	supportsPerLineLabels: boolean;
}

function detectMultilineEnvironment(latex: string): EnvironmentDetection | null {
	for (const env of MULTILINE_ENVIRONMENTS) {
		const starredPattern = new RegExp(`\\\\begin\\{${env}\\*\\}`);
		if (starredPattern.test(latex)) {
			return {
				environment: env,
				isStarred: true,
				supportsPerLineLabels: (PER_LINE_ENVIRONMENTS as readonly string[]).includes(env)
			};
		}
		const unstarredPattern = new RegExp(`\\\\begin\\{${env}\\}`);
		if (unstarredPattern.test(latex)) {
			return {
				environment: env,
				isStarred: false,
				supportsPerLineLabels: (PER_LINE_ENVIRONMENTS as readonly string[]).includes(env)
			};
		}
	}
	return null;
}

function countEnvironmentLines(latex: string): number {
	const matches = latex.match(/\\\\/g);
	return matches ? matches.length + 1 : 1;
}

/** rewrites align <-> align* (and friends) in the latex source. */
export function toggleEnvironmentStar(latex: string, addStar: boolean): string {
	for (const env of MULTILINE_ENVIRONMENTS) {
		if (addStar) {
			const beginPattern = new RegExp(`\\\\begin\\{${env}\\}`);
			if (beginPattern.test(latex)) {
				return latex
					.replace(new RegExp(`\\\\begin\\{${env}\\}`, 'g'), `\\begin{${env}*}`)
					.replace(new RegExp(`\\\\end\\{${env}\\}`, 'g'), `\\end{${env}*}`);
			}
		} else {
			const starredBeginPattern = new RegExp(`\\\\begin\\{${env}\\*\\}`);
			if (starredBeginPattern.test(latex)) {
				return latex
					.replace(new RegExp(`\\\\begin\\{${env}\\*\\}`, 'g'), `\\begin{${env}}`)
					.replace(new RegExp(`\\\\end\\{${env}\\*\\}`, 'g'), `\\end{${env}}`);
			}
		}
	}
	return latex;
}

/** initial block_math attrs for a latex string: detects multiline envs, sets numbered/lineLabels, auto-labels numbered equations. */
export function computeMathAttrs(latex: string): { environment: string | null; numbered: boolean; lineLabels: string[]; label?: string } {
	const detection = detectMultilineEnvironment(latex);

	if (!detection) {
		return { environment: null, numbered: false, lineLabels: [] };
	}

	const isNumbered = !detection.isStarred;

	if (!detection.supportsPerLineLabels) {
		const attrs: { environment: string | null; numbered: boolean; lineLabels: string[]; label?: string } = {
			environment: detection.environment,
			numbered: isNumbered,
			lineLabels: [] // single-label envs use node.attrs.label instead
		};
		if (isNumbered) {
			attrs.label = generateLabel('equation');
		}
		return attrs;
	}

	const lineCount = countEnvironmentLines(latex);
	const lineLabels = Array(lineCount)
		.fill('')
		.map(() => (isNumbered ? generateLabel('equation') : ''));

	return {
		environment: detection.environment,
		numbered: isNumbered,
		lineLabels
	};
}

if (browser) {
	MathfieldElement.soundsDirectory = null;
	configureMathVirtualKeyboard();
}
export default class MathLiveView implements NodeView {
	dom: HTMLElement;
	/** undefined until materialize() runs; see the placeholder note there */
	mathField?: MathfieldElement;
	node: Node;
	updating: boolean;
	/** static typeset standing in for the field until this node comes near the viewport */
	private placeholder?: HTMLElement;
	private mlpluginkey;
	private origFocus?: (options?: FocusOptions) => void;
	private settingsContainer?: HTMLElement;
	private settingsComponent?: ReturnType<typeof mount>;
	private isblock: boolean;
	// no user input yet: skip auto-delete on first blur (focus race when created via shortcut)
	private isNewlyCreated: boolean = true;
	// empty + one backspace = pending, second backspace or blur deletes
	private pendingDelete: boolean = false;
	private equationNumbersContainer?: HTMLElement;

	constructor(
		node: Node,
		private view: EditorView,
		private getPos: () => number,
		mlpluginkey,
		isblock: boolean = false
	) {
		this.mlpluginkey = mlpluginkey;
		this.isblock = isblock;
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		if (isblock) {
			this.dom = document.createElement('div');
			this.dom.className = 'block-math-container';
			this.dom.style.display = 'flex';
			this.dom.style.justifyContent = 'center';
			this.dom.style.position = 'relative';
			this.dom.style.alignItems = 'center';

			// data attrs drive CSS counters and multi-line styling
			this.dom.setAttribute('data-label', node.attrs.label || '');
			this.dom.setAttribute('data-numbered', node.attrs.numbered ? 'true' : 'false');
			this.dom.setAttribute('data-environment', node.attrs.environment || '');
			const lineCount = (node.attrs.lineLabels as string[])?.length || 1;
			this.dom.setAttribute('data-line-count', String(lineCount));

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
			this.placeholder.style.border = '1px solid var(--color-error-500, #ef4444)';
			this.placeholder.style.outline = 'none';
		}

		upgradeWhenNear(this.dom, this.materialize);
	}

	/** the element currently standing in for this node: the live field once there is one */
	private get host(): HTMLElement {
		return this.mathField ?? (this.placeholder as HTMLElement);
	}

	/** Replaces the static placeholder with a real MathfieldElement. Runs when the node nears the
	 * viewport, or immediately when the caret arrives first. One-way and idempotent: a field is never
	 * torn back down, so nothing can lose selection or a half-typed formula. */
	private materialize = (): void => {
		if (this.mathField) return;

		const field = new MathfieldElement();
		this.mathField = field;
		field.mathVirtualKeyboardPolicy = 'manual';
		field.style.border = 'none';
		field.style.outline = 'none';
		field.style.backgroundColor = 'transparent';
		// highlight when the cursor is inside the field
		field.style.setProperty('--contains-highlight-background-color', 'hsla(210, 100%, 85%, 0.4)');

		// this.node, not the constructor's node: edits can land while the placeholder is still up
		field.setValue(this.node.textContent || '', { format: 'latex-expanded' });

		if (this.placeholder) {
			cancelStaticMath(this.placeholder); // no point typesetting something about to be replaced
			this.dom.replaceChild(field, this.placeholder);
			this.placeholder = undefined;
		} else {
			this.dom.appendChild(field);
		}

		field.addEventListener('input', this.forwardupdate);
		field.addEventListener('move-out', this.mlkeymap);
		field.addEventListener('focus', this.handleFocus);
		field.addEventListener('blur', this.handleBlur);
		field.addEventListener('keydown', this.keydown);

		// mathlive doesn't fire focus events on programmatic .focus(), so wrap it
		this.origFocus = field.focus.bind(field);
		field.focus = ((options?: FocusOptions) => {
			this.origFocus?.(options);
			this.handleFocus();
			// bubbling event for global listeners like the toolbar
			field.dispatchEvent(new CustomEvent('ml:focusin', { bubbles: true, cancelable: true }));
		}) as typeof field.focus;

		field.mathVirtualKeyboardPolicy = 'auto';

		// undo/redo handled by prosemirror
		field.canUndo = () => false;
		field.canRedo = () => false;
		this.removeSelection();

		if (!this.view.editable) {
			field.readOnly = true;
		}

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

	/** equation numbers are sequential across the whole doc, count everything numbered before this node. */
	private getEquationStartNumber(): number {
		const myPos = this.getPos();
		let count = 1;

		this.view.state.doc.descendants((n, pos) => {
			if (pos >= myPos) return false;

			if (n.type.name === 'block_math' && n.attrs.numbered) {
				const nodeLineLabels = (n.attrs.lineLabels as string[]) || [];
				const nodeEnv = n.attrs.environment || '';
				const isSingleLabel = (SINGLE_LABEL_ENVIRONMENTS as readonly string[]).includes(nodeEnv);

				if (isSingleLabel) {
					count++;
				} else if (nodeLineLabels.length > 0) {
					count += nodeLineLabels.filter((l) => l && l.trim()).length;
				} else if (n.attrs.label) {
					count++;
				}
			}
		});

		return count;
	}

	/** per-line envs (align, gather) get JS-rendered line numbers, single-label ones use CSS ::after. */
	private updateEquationNumbers() {
		if (!this.equationNumbersContainer) return;

		const isNumbered = this.node.attrs.numbered;
		const environment = this.node.attrs.environment;
		const lineLabels = (this.node.attrs.lineLabels as string[]) || [];

		this.equationNumbersContainer.innerHTML = '';

		const startingNumber = this.getEquationStartNumber();

		// CSS ::after reads this for single-line equations
		this.dom.setAttribute('data-equation-number', String(startingNumber));

		const isSingleLabelEnv = (SINGLE_LABEL_ENVIRONMENTS as readonly string[]).includes(environment || '');

		if (!isNumbered || !environment || isSingleLabelEnv) {
			this.equationNumbersContainer.style.display = 'none';
			return;
		}

		const effectiveLineCount = Math.max(lineLabels.length, 1);

		this.equationNumbersContainer.style.display = 'flex';

		for (let i = 0; i < effectiveLineCount; i++) {
			const numEl = document.createElement('span');
			numEl.className = 'equation-number-line';
			numEl.textContent = `(${startingNumber + i})`;
			numEl.setAttribute('data-line-label', lineLabels[i] || '');
			this.equationNumbersContainer!.appendChild(numEl);
		}
	}

	handleFocus() {
		this.updateOutline(true);
	}
	handleBlur() {
		const isEmpty = this.isMathfieldEmpty();

		if (isEmpty && (this.pendingDelete || !this.isNewlyCreated)) {
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

		this.pendingDelete = false;

		this.updateOutline(false);
		this.removeSelection();
	}

	/** empty fields get a red border even when blurred. */
	private updateOutline(focus: boolean) {
		const target = this.host;
		const isEmpty = this.isMathfieldEmpty();
		if (isEmpty) {
			// keep pending-delete styling if active
			if (!this.pendingDelete) {
				target.style.border = '1px solid var(--color-error-500, #ef4444)';
				target.style.backgroundColor = 'transparent';
			}
			target.style.outline = 'none';
			return;
		}
		this.pendingDelete = false;
		target.style.backgroundColor = 'transparent';
		if (focus) {
			target.style.border = '1px solid #000';
			target.style.outline = 'none';
		} else {
			target.style.border = 'none';
			target.style.outline = 'none';
		}
	}

	forwardupdate() {
		const field = this.mathField;
		// only ever reached from the field's own listeners, so this is a type guard, not a case
		if (!field) return;
		if (this.updating || !field.hasFocus) return;

		this.isNewlyCreated = false;

		if (!this.isMathfieldEmpty() && this.pendingDelete) {
			this.pendingDelete = false;
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
				const newAttrs = { ...this.node.attrs };

				// block math: re-detect the multiline env from the new content and sync attrs
				if (this.isblock) {
					const detection = detectMultilineEnvironment(newValue);
					const currentEnv = this.node.attrs.environment;
					const detectedEnv = detection?.environment || null;

					if (detectedEnv !== currentEnv) {
						newAttrs.environment = detectedEnv;
						if (detection) {
							if (!detection.supportsPerLineLabels) {
								newAttrs.lineLabels = [];
								newAttrs.numbered = !detection.isStarred;
							} else {
								const lineCount = countEnvironmentLines(newValue);
								const existingLabels = (this.node.attrs.lineLabels as string[]) || [];
								// keep existing labels, auto-generate for new lines when numbered
								newAttrs.lineLabels = Array(lineCount)
									.fill('')
									.map((_, i) => existingLabels[i] || (!detection.isStarred ? generateLabel('equation') : ''));
								newAttrs.numbered = !detection.isStarred;
							}
						} else {
							newAttrs.lineLabels = [];
						}
					} else if (detection) {
						const wasNumbered = this.node.attrs.numbered;
						const shouldBeNumbered = !detection.isStarred;
						if (wasNumbered !== shouldBeNumbered) {
							newAttrs.numbered = shouldBeNumbered;
						}
						if (detection.supportsPerLineLabels) {
							const lineCount = countEnvironmentLines(newValue);
							const existingLabels = (this.node.attrs.lineLabels as string[]) || [];
							if (lineCount !== existingLabels.length) {
								newAttrs.lineLabels = Array(lineCount)
									.fill('')
									.map((_, i) => existingLabels[i] || (shouldBeNumbered ? generateLabel('equation') : ''));
							}
						}
					}
				}

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
			this.dom.setAttribute('data-label', node.attrs.label || '');
			this.dom.setAttribute('data-numbered', node.attrs.numbered ? 'true' : 'false');
			this.dom.setAttribute('data-environment', node.attrs.environment || '');
			const lineCount = (node.attrs.lineLabels as string[])?.length || 1;
			this.dom.setAttribute('data-line-count', String(lineCount));
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

	mlkeymap(event) {
		event.preventDefault();
		this.maybeEscape(event.detail.direction);
	}

	maybedelete(dir = 1) {
		if (this.isMathfieldEmpty()) {
			if (!this.pendingDelete) {
				this.pendingDelete = true;
				this.host.style.border = '1px solid var(--color-error-500, #ef4444)';
				this.host.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
				return true; // keep the cursor inside
			}

			const pos = this.getPos();
			let tr = this.view.state.tr;

			tr.delete(pos, pos + this.node.nodeSize);
			tr = setTextSelection(pos, dir)(tr);

			this.view.dispatch(tr);
			this.view.focus();
			return true;
		}
		this.pendingDelete = false;
		this.host.style.backgroundColor = 'transparent';
		return false;
	}

	/** empty including wrapper-only content like \begin{align} & \end{align}. */
	private isMathfieldEmpty(): boolean {
		// before materialize() the node's own text is the source of truth; the field has not been
		// built to ask, and it would hold exactly this anyway
		const rawValue = this.mathField ? this.mathField.getValue('latex-expanded') : this.node.textContent || '';

		if (rawValue.length < 1 || rawValue.trim() === '' || rawValue === ' ') {
			return true;
		}

		const strippedValue = rawValue
			// drop envs whose body is only whitespace, &, or \\
			.replace(/\\begin\{([^}]+)\}[\s&\\]*\\end\{\1\}/g, '')
			.replace(/&/g, '')
			.replace(/\\\\/g, '')
			.trim();

		return strippedValue.length === 0;
	}

	keydown(event: KeyboardEvent) {
		const field = this.mathField;
		if (!field) return; // a key event means the field exists; this is a type guard
		if (event.key === 'Backspace') {
			if (field.selection.ranges[0][0] !== field.selection.ranges[0][1] || field.selection.ranges[0][1] !== 0) {
				return;
			}
			if (!this.maybedelete(-1) && field.selection.ranges) {
				let tr = this.view.state.tr;
				tr = setTextSelection(this.getPos(), -1)(tr);

				this.view.dispatch(tr);
				this.view.focus();
			}
		}
	}

	maybeEscape(dir: string) {
		if (dir == 'backward') {
			this.maybedelete(-1);
			this.deselectNode();
			this.view.focus();
			const tr = this.view.state.tr;
			const targetPos = this.getPos();
			// Selection.near falls back to a GapCursor when there's no text position
			const resolvedPos = tr.doc.resolve(targetPos);
			tr.setSelection(Selection.near(resolvedPos, -1));
			this.view.dispatch(tr);
		} else if (dir == 'forward') {
			this.maybedelete(1);

			this.deselectNode();
			this.view.focus();
			const tr = this.view.state.tr;
			const targetPos = this.getPos() + this.node.nodeSize;
			const resolvedPos = tr.doc.resolve(targetPos);
			tr.setSelection(Selection.near(resolvedPos, 1));
			this.view.dispatch(tr);
		}
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
		cancelUpgrade(this.dom);
		if (this.placeholder) cancelStaticMath(this.placeholder);
		const field = this.mathField;
		if (field) {
			field.removeEventListener('input', this.forwardupdate);
			field.removeEventListener('move-out', this.mlkeymap);
			field.removeEventListener('focus', this.handleFocus);
			field.removeEventListener('blur', this.handleBlur);
			field.removeEventListener('keydown', this.keydown);
			if (this.origFocus) {
				field.focus = this.origFocus as typeof field.focus;
				this.origFocus = undefined;
			}
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
