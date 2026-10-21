// named for @codemirror/search, which takes these exact fields
export type FindOptions = {
	caseSensitive: boolean;
	wholeWord: boolean;
	regexp: boolean;
};

export const NO_FIND_OPTIONS: FindOptions = { caseSensitive: false, wholeWord: false, regexp: false };

export function toggledFindOption(options: FindOptions, key: keyof FindOptions): FindOptions {
	return { ...options, [key]: !options[key] };
}
