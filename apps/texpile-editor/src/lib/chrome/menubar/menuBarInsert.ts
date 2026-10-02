// The Insert menu's dispatchers. Source mode dispatches the SAME compute*/skeleton edits the
// source toolbars use, so the menu and the toolbar cannot drift apart: links leave the URL
// placeholder selected instead of raising a prompt, fences grow past inner backticks with the
// caret on the info slot, tables and rules land on their own lines, and images insert the
// full dialect skeleton.
import { editorViewStore, referenceStore } from '$lib/stores/editorStore';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { computeMathAttrs } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { createTableNode } from '$lib/editor/visual/tableUtils';
import { typTableNode } from '$lib/languages/typst/visual/blockInsertItems';
import { definedFunctions, environmentSuggestions, environmentsInDoc } from '$lib/languages/typst/visual/envNames';
import { envHeadReadsBack } from '$lib/languages/typst/visual/extensions/env/envHeadEdits';
import { mdTableNode } from '$lib/languages/markdown/visual/blockInsertItems';
import { toggleLinkCommand } from '$lib/editor/visual/toolbar/markState';
import { computeLink as texLink, computeWrapBlock } from '$lib/languages/latex/intellisense/shortcuts';
import { tableLatex } from '$lib/editor/source/toolbar/tableLatex';
import { insertSnippetAtCursor } from '$lib/editor/source/toolbar/sourceInsert';
import {
	computeFence as mdFence,
	computeTableSkeleton as mdTable,
	computeImage as mdImage,
	computeHr as mdHr,
	computeLink as mdLink
} from '$lib/languages/markdown/source/sourceInsert';
import {
	computeFence as typFence,
	computeTableSkeleton as typTable,
	computeFigureSkeleton as typFigure,
	computeHr as typHr,
	computeLink as typLink
} from '$lib/languages/typst/source/sourceInsert';
import { runVisualCommand, insertNode, activeCm, cmReplace, cmApply } from '$lib/chrome/menuBarCommands';
import { makeDrawnInserts } from './menuBarInsertDrawn';
import { makeTypstInserts } from './menuBarInsertTypst';
import type { formatOf } from '$lib/workspace/documentBuffer.svelte';
import type { Node as PMNode } from 'prosemirror-model';
import { m } from '$lib/paraglide/messages';
import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';
import { latexSymbolSet } from '$lib/languages/latex/symbols/latexSymbolSet';

type InsertDeps = {
	dialect: () => ReturnType<typeof formatOf>;
	askText: (title: string, initial?: string, offered?: string[]) => Promise<string | null>;
	pickImage: () => void;
};

// display-math templates; block_math detects the environment from content (computeMathAttrs)
const MATH_ENVS: Record<string, string> = {
	align: '\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}',
	aligned: '\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}',
	gather: '\\begin{gather}\na + b \\\\\nc + d\n\\end{gather}',
	cases: 'f(x) = \\begin{cases}\nx & \\text{if } x \\geq 0 \\\\\n-x & \\text{otherwise}\n\\end{cases}',
	multline: '\\begin{multline}\na + b + c \\\\\n+ d + e + f\n\\end{multline}',
	split: '\\begin{split}\na &= b \\\\\n&= c\n\\end{split}',
	bmatrix: '\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}',
	pmatrix: '\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}'
};
// the ones Typst has a form for, as Typst writes them; gather, multline and split have none
const TYPST_MATH_ENVS: Record<string, string> = {
	aligned: 'a &= b \\\nc &= d',
	cases: 'f(x) = cases(x & "if" x >= 0, -x & "otherwise")',
	bmatrix: 'mat(delim: "[", a, b; c, d)',
	pmatrix: 'mat(a, b; c, d)'
};

function insertMathEnvironment(content: string, dialect: ReturnType<typeof formatOf>) {
	const v = editorViewStore.current;
	if (!v) return;
	const attrs = dialect === 'typ' ? null : computeMathAttrs(content);
	const node = v.state.schema.nodes.block_math.create(attrs, v.state.schema.text(content));
	v.dispatch(v.state.tr.replaceSelectionWith(node));
	v.focus();
}

export function makeInsertHandlers(deps: InsertDeps): {
	mathSelect: (value: string) => void;
	insertSelect: (value: string) => Promise<void>;
} {
	function mathSelect(value: string) {
		const dialect = deps.dialect();
		const cm = activeCm();
		if (cm) {
			// the env/matrix items render for tex, and those Typst can hold for typ (written as the visual editor writes them)
			if (value === 'inline') cmReplace(cm, '$', '$');
			else if (value === 'display') {
				if (dialect === 'tex') cmReplace(cm, '\\[\n', '\n\\]');
				else if (dialect === 'typ') cmReplace(cm, '$ ', ' $');
				else cmReplace(cm, '$$\n', '\n$$');
			} else if (dialect === 'tex' && MATH_ENVS[value]) cmReplace(cm, MATH_ENVS[value]);
			else if (dialect === 'typ' && TYPST_MATH_ENVS[value]) cmReplace(cm, `$ ${TYPST_MATH_ENVS[value]} $`);
			return;
		}
		if (value === 'inline') runVisualCommand(createMathField());
		else if (value === 'display') runVisualCommand(createMathField(true));
		else if (dialect === 'tex' && MATH_ENVS[value]) insertMathEnvironment(MATH_ENVS[value], dialect);
		else if (dialect === 'typ' && TYPST_MATH_ENVS[value]) insertMathEnvironment(TYPST_MATH_ENVS[value], dialect);
	}

	const insertDrawn = makeDrawnInserts(deps);
	const insertTypst = makeTypstInserts(deps);

	/** the function a new typst environment calls, offering the ones the document defines first; a
	 *  name that would not read back as an environment is not taken */
	async function askTypstEnvironment(source: string, used: string[]): Promise<string | null> {
		const offered = environmentSuggestions(source, used);
		const initial = definedFunctions(source)[0] ?? 'block';
		const name = (await deps.askText(m.menubar_prompt_typst_environment_name(), initial, offered))?.trim();
		return name && envHeadReadsBack(name, null) ? name : null;
	}

	async function insertSelect(value: string) {
		if (deps.dialect() === 'typ' && (await insertTypst(value))) return;
		// Symbol…: the picker inserts where the caret is, in either mode
		if (deps.dialect() === 'tex' && value === 'symbolpicker') return void (await symbolPicker.show(latexSymbolSet));
		if (await insertDrawn(value)) return;
		const dialect = deps.dialect();
		const cm = activeCm();
		if (cm) {
			const s = cm.state;
			switch (value) {
				case 'code':
					if (dialect === 'tex') cmApply(cm, computeWrapBlock(s, '\\begin{verbatim}\n', '\n\\end{verbatim}'));
					else cmApply(cm, dialect === 'typ' ? typFence(s) : mdFence(s));
					break;
				case 'table':
					// the toolbar dropdowns' default shape (the dropdown itself is where sizes live)
					if (dialect === 'tex') insertSnippetAtCursor(cm, tableLatex({ rows: 3, cols: 3, float: true, rules: true, header: true }));
					else cmApply(cm, dialect === 'typ' ? typTable(s) : mdTable(s));
					break;
				case 'image':
					if (dialect === 'tex') cmReplace(cm, '\\includegraphics{', '}');
					else cmApply(cm, dialect === 'typ' ? typFigure(s) : mdImage(s));
					break;
				case 'hrule':
					if (dialect === 'tex') cmApply(cm, computeWrapBlock(s, '\\rule{\\linewidth}{0.4pt}', ''));
					else cmApply(cm, dialect === 'typ' ? typHr(s) : mdHr(s));
					break;
				case 'link':
					if (dialect === 'tex') cmApply(cm, texLink(s));
					else cmApply(cm, dialect === 'typ' ? typLink(s) : mdLink(s));
					break;
				case 'citation': {
					const key = referenceStore.current?.[0]?.key ?? 'key';
					if (dialect === 'tex') cmReplace(cm, `\\autocite{${key}}`);
					else if (dialect === 'typ') cmReplace(cm, `@${key}`);
					break;
				}
				case 'environment': {
					if (dialect === 'typ') {
						const name = await askTypstEnvironment(s.doc.toString(), []);
						if (name) cmReplace(cm, `#${name}[`, ']');
						break;
					}
					if (dialect !== 'tex') break; // tex and typst items; unreachable elsewhere
					const name = (await deps.askText(m.menubar_prompt_environment_name(), 'center'))?.trim();
					if (name) cmReplace(cm, `\\begin{${name}}\n`, `\n\\end{${name}}`);
					break;
				}
				// rawlatex / inlinelatex are PM-only nodes; in CM you're already writing the raw syntax
			}
			return;
		}
		switch (value) {
			case 'code':
				// the schemas default md/typ code blocks to fences, so one command serves all three
				runVisualCommand(createCodeBlock());
				break;
			case 'table':
				// each dialect's own default table: md's createTableNode crashed here (its schema has
				// no table_caption) and always numbered a table markdown cannot number
				insertNode((state) =>
					dialect === 'typ'
						? typTableNode(state.schema)
						: dialect === 'md'
							? mdTableNode(state.schema)
							: (createTableNode(state.schema, 3, 3) as unknown as PMNode)
				);
				break;
			case 'image':
				deps.pickImage();
				break;
			case 'rawlatex':
				insertNode((state) => state.schema.nodes.raw_latex.create(null, state.schema.text('\\textbf{LaTeX}')));
				break;
			case 'inlinelatex':
				insertNode((state) => state.schema.nodes.inline_latex.create(null, state.schema.text('\\LaTeX')));
				break;
			case 'hrule':
				insertNode((state) => state.schema.nodes.horizontal_rule.create());
				break;
			case 'link':
				// the toolbars' link command: placeholder linked text with the caret inside, so the
				// link tooltip opens for the URL edit - the same popup either way in, no modal prompt
				runVisualCommand((state, dispatch) => {
					const mark = state.schema.marks.link;
					return mark ? toggleLinkCommand(mark)(state, dispatch) : false;
				});
				break;
			case 'citation': {
				const key = referenceStore.current?.[0]?.key ?? 'key';
				insertNode((state) =>
					state.schema.nodes.typ_ref
						? state.schema.nodes.typ_ref.create({ target: key })
						: state.schema.nodes.citation.create({ variant: 'autocite' }, state.schema.text(key))
				);
				break;
			}
			case 'environment': {
				if (dialect === 'typ') {
					const doc = editorViewStore.current?.state.doc;
					const found = doc ? environmentsInDoc(doc) : { source: '', used: [] };
					const typName = await askTypstEnvironment(found.source, found.used);
					if (typName) insertNode((state) => state.schema.nodes.typ_env.create({ name: typName }, state.schema.nodes.paragraph.create()));
					break;
				}
				const name = await deps.askText(m.menubar_prompt_environment_name(), 'center');
				if (name?.trim())
					insertNode((state) => state.schema.nodes.environment.create({ name: name.trim() }, state.schema.nodes.paragraph.create()));
				break;
			}
		}
	}

	return { mathSelect, insertSelect };
}
