// harper.js client-side (wasm) spell and grammar checking

export {
	getHarperLinter,
	lintText,
	addWordsToDictionary,
	clearDictionary,
	getLintConfig,
	setLintConfig,
	exportDictionary,
	syncDocumentDictionary,
	addWordToDocumentDictionary,
	addWordsToDocumentDictionary,
	removeWordFromDocumentDictionary
} from './linter';

export { createHarperSuggestionBox } from './suggestionBoxFactory';
export type { SuggestionBoxOptions, Problem } from './suggestionBoxFactory';
