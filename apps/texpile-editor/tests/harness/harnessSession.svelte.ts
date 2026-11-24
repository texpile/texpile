import type { Node as PMNode } from 'prosemirror-model';
import { DocumentBuffer, fileKind, formatOf, hasVisualMode } from '$lib/workspace/documentBuffer.svelte';
import { VisualParser } from '$lib/workspace/visualParse.svelte';
import { fileService } from '$lib/files/service/fileService';
import { setEditorFileAccess, setEditorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { graphicSearchDirs } from '$lib/editor/visual/graphicsCandidates';
import { mathMacrosFor } from '$lib/editor/source/extensions/math-preview/userMacros';
import { setMathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { retypesetStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { mergeReferences, references } from '$lib/workspace/citations';
import { mainFile, workspaceRoot, activeFilePath } from '$lib/workspace/workspaceStore';
import type { PreambleSpan } from '$lib/languages/latex/visual/core/title/preambleFields';
import { MemoryFolder } from './memoryFolder';

export type HarnessLoad = {
	root: string;
	/** text files by path relative to the folder */
	files?: Record<string, string>;
	/** binary files (images) by relative path, base64 */
	binary?: Record<string, string>;
	/** macro-defining text from the main file's include chain */
	projectMacros?: string;
	mainFile?: string | null;
};

/** what the workspace wires around one open file, without the workspace: memory folder, document buffer and parser */
export class HarnessSession {
	folder = new MemoryFolder('/harness', () => {});
	projectMacros = '';
	private detach: (() => void) | null = null;
	private readyWaiters: (() => void)[] = [];
	private readonly parser = new VisualParser(() => this.projectMacros);
	private readonly buffer = new DocumentBuffer({
		writeNow: () => this.mirror(),
		rebuildVisual: () => void this.parseOpen(),
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {},
		projectMacros: () => this.projectMacros
	});
	// the parse worker loads its modules on the first parse, which a loaded machine can hold past the parse timeout, and
	// a timeout drops the worker, so warm it until one parse comes back
	private readonly warmed = this.warm();

	constructor(private readonly onWrite: (path: string, text: string) => void) {}

	get shown(): boolean {
		return !!this.buffer.visualDoc && !!this.buffer.path;
	}
	get kind() {
		return this.buffer.kind;
	}
	get path(): string {
		return this.buffer.path ?? '';
	}
	get doc(): PMNode {
		return this.buffer.visualDoc!;
	}
	get meta() {
		return this.buffer.docMeta;
	}
	get texSource(): string {
		return this.buffer.texSource;
	}
	get sourceMap() {
		return this.buffer.sourceMap;
	}
	get regionParser() {
		return this.buffer.regionParser;
	}

	load(options: HarnessLoad): void {
		this.detach?.();
		this.folder = new MemoryFolder(options.root, this.onWrite);
		for (const [rel, text] of Object.entries(options.files ?? {})) this.folder.setText(rel, text);
		for (const [rel, base64] of Object.entries(options.binary ?? {})) this.folder.setBytes(rel, base64);
		this.projectMacros = options.projectMacros ?? '';
		workspaceRoot.current = options.root;
		mainFile.current = options.mainFile ? this.folder.absolute(options.mainFile) : null;
		references.current = mergeReferences(this.folder.textsUnder('bib'));
		const stopProvider = fileService.use(this.folder.provider());
		setEditorFileAccess((path) => fileService.fileUrl(path));
		setEditorGraphicDirs(() => graphicSearchDirs({ root: workspaceRoot.current, loadedPath: this.path, source: this.texSource }));
		this.detach = () => {
			stopProvider();
			setEditorFileAccess(null);
			setEditorGraphicDirs(null);
		};
	}

	/** shows a file of the folder in its editor; resolves after the editor's first painted frame of it */
	async open(rel: string): Promise<void> {
		const path = this.folder.absolute(rel);
		const text = this.folder.text(path);
		if (text === undefined || !hasVisualMode(fileKind(path))) throw new Error(`no visual document at ${rel}`);
		this.buffer.openTex(path, text, '\n');
		activeFilePath.current = path;
		const ready = new Promise<void>((resolve) => this.readyWaiters.push(resolve));
		await this.warmed;
		await this.parseOpen();
		await ready;
	}

	private async warm(): Promise<void> {
		for (let tries = 0; tries < 5; tries++)
			if ((await this.parser.parse('\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n', 'tex', false)).parsed) return;
	}

	private async parseOpen(): Promise<void> {
		const { path, texSource } = { path: this.buffer.path, texSource: this.buffer.fileText };
		if (!path) return;
		const { parsed, failure } = await this.parser.parse(texSource, formatOf(this.buffer.kind));
		if (!parsed) throw new Error(`${path} did not parse: ${failure?.message}`);
		this.buffer.adoptParsed(parsed, texSource);
		if (setMathMacros(mathMacrosFor(texSource, parsed.scans?.macros))) retypesetStaticMath();
	}

	onReady = (): void => {
		for (const resolve of this.readyWaiters.splice(0)) resolve();
	};

	onVisualChange = (doc: PMNode): void => {
		this.buffer.onVisualChange(doc);
		this.mirror();
	};

	editFrontmatter = (span: PreambleSpan, inner: string): void => {
		this.buffer.editFrontmatter(span, inner);
		this.mirror();
	};

	/** the text the open file has now, as the saved file would be */
	private mirror(): void {
		if (this.buffer.path) this.folder.write(this.buffer.path, this.buffer.fileText);
	}
}
