/** a template the user saved from one of their projects (electron/src/templates/userTemplates.ts) */
export type UserTemplate = {
	id: string;
	name: string;
	description: string;
	lang: 'latex' | 'typst';
	/** root-relative, forward-slashed */
	mainFile: string;
	createdAt: number;
	/** the Git address a project made from it is cloned from; absent for a copy of files */
	remote?: string;
};

export type SurveyedFile = {
	/** root-relative, forward-slashed */
	path: string;
	size: number;
};

export type ProjectSurvey = {
	files: SurveyedFile[];
	/** the folder holds more files than the survey counts */
	truncated: boolean;
	/** how many it counts at most */
	limit: number;
};

export type SaveTemplateRequest = {
	root: string;
	files: string[];
	name: string;
	description: string;
	lang: 'latex' | 'typst';
	mainFile: string;
	replaceId?: string;
	/** save this address instead of copying files */
	remote?: string;
};

/** a Typst Universe package that is a template, at its newest version */
export type UniverseTemplate = {
	name: string;
	version: string;
	description: string;
	authors: string[];
	keywords: string[];
	categories: string[];
	thumbnail: boolean;
};

export type UniverseIndex = { ok: true; templates: UniverseTemplate[] } | { ok: false; reason: 'offline' | 'failed'; error?: string };

export type UniverseThumbnail = { ok: true; bytes: Uint8Array; type: string } | { ok: false };

export type TexpileTemplatesBridge = {
	list(): Promise<UserTemplate[]>;
	survey(root: string): Promise<ProjectSurvey>;
	save(req: SaveTemplateRequest): Promise<UserTemplate>;
	update(id: string, name: string, description: string): Promise<UserTemplate>;
	remove(id: string): Promise<void>;
	/** resolves to the absolute path of the template's main file inside root */
	apply(id: string, root: string): Promise<string>;
	stage(): Promise<string>;
	adopt(dir: string, root: string): Promise<void>;
	discard(dir: string): Promise<void>;
	universeIndex(): Promise<UniverseIndex>;
	universeThumbnail(name: string, version: string): Promise<UniverseThumbnail>;
	/** the template's entry file, relative to `dir` */
	universeUnpack(name: string, version: string, dir: string): Promise<{ entryPath: string }>;
};
