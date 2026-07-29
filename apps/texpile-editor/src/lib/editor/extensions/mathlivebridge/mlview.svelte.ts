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
	mathField: MathfieldElement;
	node: Node;
	updating: boolean;
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

		this.mathField = new MathfieldElement();
		this.mathField.mathVirtualKeyboardPolicy = 'manual';
		this.mathField.style.border = 'none';
		this.mathField.style.outline = 'none';
		this.mathField.style.backgroundColor = 'transparent';
		// highlight when the cursor is inside the field
		this.mathField.style.setProperty('--contains-highlight-background-color', 'hsla(210, 100%, 85%, 0.4)');

		const initialContent = node.textContent || '';
		this.mathField.setValue(initialContent, {
			format: 'latex-expanded'
		});

		this.dom.appendChild(this.mathField);

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
		this.mathField.addEventListener('input', this.forwardupdate);
		this.mathField.addEventListener('move-out', this.mlkeymap);
		this.mathField.addEventListener('focus', this.handleFocus);
		this.mathField.addEventListener('blur', this.handleBlur);
		this.mathField.addEventListener('keydown', this.keydown);

		// mathlive doesn't fire focus events on programmatic .focus(), so wrap it
		this.origFocus = this.mathField.focus.bind(this.mathField);
		this.mathField.focus = ((options?: FocusOptions) => {
			this.origFocus?.(options);
			this.handleFocus();
			// bubbling event for global listeners like the toolbar
			this.mathField.dispatchEvent(new CustomEvent('ml:focusin', { bubbles: true, cancelable: true }));
		}) as typeof this.mathField.focus;

		this.mathField.mathVirtualKeyboardPolicy = 'auto';

		// undo/redo handled by prosemirror
		this.mathField.canUndo = () => false;
		this.mathField.canRedo = () => false;
		this.removeSelection();

		if (!this.view.editable) {
			this.mathField.readOnly = true;
		}

		// use node.textContent, getValue() may not be ready yet
		const initialValue = node.textContent || '';
		const isEmpty = initialValue.trim().length === 0;
		if (isEmpty) {
			this.mathField.style.border = '1px solid var(--color-error-500, #ef4444)';
			this.mathField.style.outline = 'none';
		} else {
			this.mathField.style.border = 'none';
			this.mathField.style.outline = 'none';
		}
	}

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
		const isEmpty = this.isMathfieldEmpty();
		if (isEmpty) {
			// keep pending-delete styling if active
			if (!this.pendingDelete) {
				this.mathField.style.border = '1px solid var(--color-error-500, #ef4444)';
				this.mathField.style.backgroundColor = 'transparent';
			}
			this.mathField.style.outline = 'none';
			return;
		}
		this.pendingDelete = false;
		this.mathField.style.backgroundColor = 'transparent';
		if (focus) {
			this.mathField.style.border = '1px solid #000';
			this.mathField.style.outline = 'none';
		} else {
			this.mathField.style.border = 'none';
			this.mathField.style.outline = 'none';
		}
	}

	forwardupdate() {
		if (this.updating || !this.mathField.hasFocus) return;

		this.isNewlyCreated = false;

		if (!this.isMathfieldEmpty() && this.pendingDelete) {
			this.pendingDelete = false;
			this.mathField.style.backgroundColor = 'transparent';
		}

		const currentContent = this.node.textContent || '';
		const newValue = this.mathField.getValue('latex-expanded');
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

		this.updateOutline(this.mathField.hasFocus());
	}

	setSelection(anchor: number, head: number) {
		if (!this.updating) return;
		this.mathField.focus();
		if (anchor === 0 && head === 0) {
			this.mathField.executeCommand('moveToMathfieldStart' as never);
		} else {
			this.mathField.executeCommand('moveToMathfieldEnd' as never);
		}
	}

	update(node: Node) {
		if (node.type !== this.node.type) return false;
		this.node = node;
		if (this.updating) return true;

		// while focused, trust mathlive: stale PM content could clobber typing during the
		// rAF window before the updating flag clears. next forwardupdate() re-syncs.
		if (this.mathField.hasFocus()) return true;

		const newText = node.textContent || '';
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

		this.updateOutline(this.mathField.hasFocus());
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
				this.mathField.style.border = '1px solid var(--color-error-500, #ef4444)';
				this.mathField.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
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
		this.mathField.style.backgroundColor = 'transparent';
		return false;
	}

	/** empty including wrapper-only content like \begin{align} & \end{align}. */
	private isMathfieldEmpty(): boolean {
		const rawValue = this.mathField.getValue('latex-expanded');

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
		if (event.key === 'Backspace') {
			if (this.mathField.selection.ranges[0][0] !== this.mathField.selection.ranges[0][1] || this.mathField.selection.ranges[0][1] !== 0) {
				return;
			}
			if (!this.maybedelete(-1) && this.mathField.selection.ranges) {
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
		return true; // mathlive owns all events inside the field
	}

	selectNode() {
		const maybePos = this.mlpluginkey.getState(this.view.state)?.prevCursorPos;

		this.mathField.focus();
		console.log(this.mathField.value);

		// enter from the side the cursor approached from
		const nodeStart = this.getPos();
		if (maybePos === undefined || maybePos <= nodeStart) {
			this.mathField.executeCommand('moveToMathfieldStart' as never);
		} else {
			this.mathField.executeCommand('moveToMathfieldEnd' as never);
		}
	}

	removeSelection() {
		this.mathField.selection = { ranges: [[0, 0]] };
	}

	deselectNode() {
		if (this.updating) {
			return;
		}
		this.removeSelection();
		this.mathField.blur();
		this.updateOutline(false);
	}
	destroy() {
		this.mathField.removeEventListener('input', this.forwardupdate);
		this.mathField.removeEventListener('move-out', this.mlkeymap);
		this.mathField.removeEventListener('focus', this.handleFocus);
		this.mathField.removeEventListener('blur', this.handleBlur);
		this.mathField.removeEventListener('keydown', this.keydown);
		if (this.origFocus) {
			this.mathField.focus = this.origFocus as typeof this.mathField.focus;
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
