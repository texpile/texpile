// wrapper around the harper.js WorkerLinter singleton
import { WorkerLinter, Dialect, binary } from 'harper.js';
import type { Lint, LintConfig, LintOptions } from 'harper.js';
import { editorConfigStore } from '$lib/stores/editorStore';
import { get } from 'svelte/store';

let linterInstance: WorkerLinter | null = null;

let lastLoadedDictionary: string[] = [];

export async function getHarperLinter(): Promise<WorkerLinter> {
	if (!linterInstance) {
		linterInstance = new WorkerLinter({
			binary,
			dialect: Dialect.American
		});

		// setup up front so the first lint isn't slow
		await linterInstance.setup();

		await linterInstance.importWords(['Texpile', 'LaTeX', 'WYSIWYM', 'CTRL', 'CMD']);

		const config = await linterInstance.getLintConfig();
		await linterInstance.setLintConfig(config);
	}

	return linterInstance;
}

/** lints text, returning matches in prosemirror-proofread format. */
export async function lintText(
	text: string,
	options?: { language?: LintOptions['language']; isStale?: () => boolean }
): Promise<{
	matches: Array<{
		offset: number;
		length: number;
		message: string;
		shortMessage?: string;
		type: { typeName: string };
		replacements?: string[];
	}>;
}> {
	try {
		const linter = await getHarperLinter();
		const lints: Lint[] = await linter.lint(text, options?.language ? { language: options.language } : undefined);
		// mapping below hydrates wasm objects on the main thread; skip it when the caller already
		// knows the result is superseded
		if (options?.isStale?.()) return { matches: [] };

		const matches = lints.map((lint) => {
			const span = lint.span();
			const suggestions: string[] = [];

			// suggestions() re-materializes the wasm array on every call, so read it once
			for (const sug of lint.suggestions()) {
				const replacement = sug.get_replacement_text();
				if (replacement) {
					suggestions.push(replacement);
				}
			}

			// prosemirror-proofread prefixes typeName with 'proofread-' for the css styling
			const lintKind = lint.lint_kind();

			const match = {
				offset: span.start,
				length: span.end - span.start,
				message: lint.message(),
				shortMessage: lint.message().split('.')[0],
				type: {
					typeName: lintKind || 'miscellaneous'
				},
				replacements: suggestions.length > 0 ? suggestions : undefined
			};
			return match;
		});

		return { matches };
	} catch (error) {
		console.error('[Harper] Linting error:', error);
		return { matches: [] };
	}
}

export async function addWordsToDictionary(words: string[]): Promise<void> {
	const linter = await getHarperLinter();
	await linter.importWords(words);
}

export async function clearDictionary(): Promise<void> {
	const linter = await getHarperLinter();
	await linter.clearWords();
}

export async function getLintConfig(): Promise<LintConfig> {
	const linter = await getHarperLinter();
	return await linter.getLintConfig();
}

export async function setLintConfig(config: LintConfig): Promise<void> {
	const linter = await getHarperLinter();
	await linter.setLintConfig(config);
}

export async function exportDictionary(): Promise<string[]> {
	const linter = await getHarperLinter();
	return await linter.exportWords();
}

/** loads custom words from editorConfigStore into harper's dictionary. */
export async function syncDocumentDictionary(): Promise<void> {
	const linter = await getHarperLinter();
	const currentConfig = get(editorConfigStore);
	const documentDictionary = currentConfig?.dictionary || [];

	const dictionaryChanged =
		documentDictionary.length !== lastLoadedDictionary.length || documentDictionary.some((word, i) => word !== lastLoadedDictionary[i]);

	if (dictionaryChanged) {
		console.log('[Harper] Syncing document dictionary:', documentDictionary);

		await linter.clearWords();

		await linter.importWords(['Texpile', 'LaTeX', 'ProseMirror', 'WebAssembly', 'TypeScript', 'JavaScript']);

		if (documentDictionary.length > 0) {
			await linter.importWords(documentDictionary);
		}

		lastLoadedDictionary = [...documentDictionary];
	}
}

export async function addWordToDocumentDictionary(word: string): Promise<void> {
	const currentConfig = get(editorConfigStore);
	const currentDictionary = currentConfig?.dictionary || [];

	const normalizedWord = word.trim().toLowerCase();

	if (!normalizedWord) {
		console.warn('[Harper] Cannot add empty word to dictionary');
		return;
	}

	if (currentDictionary.includes(normalizedWord)) {
		console.log('[Harper] Word already in dictionary:', normalizedWord);
		return;
	}

	console.log('[Harper] Adding word to dictionary:', normalizedWord);

	const updatedConfig = {
		...currentConfig,
		dictionary: [...currentDictionary, normalizedWord]
	};
	editorConfigStore.set(updatedConfig);

	const linter = await getHarperLinter();
	await linter.importWords([normalizedWord]);

	lastLoadedDictionary = [...currentDictionary, normalizedWord];
}

export async function removeWordFromDocumentDictionary(word: string): Promise<void> {
	const currentConfig = get(editorConfigStore);
	const currentDictionary = currentConfig?.dictionary || [];

	const normalizedWord = word.trim().toLowerCase();

	if (!currentDictionary.includes(normalizedWord)) {
		console.log('[Harper] Word not in dictionary:', normalizedWord);
		return;
	}

	console.log('[Harper] Removing word from dictionary:', normalizedWord);

	const updatedConfig = {
		...currentConfig,
		dictionary: currentDictionary.filter((w) => w !== normalizedWord)
	};
	editorConfigStore.set(updatedConfig);

	await syncDocumentDictionary();
}
