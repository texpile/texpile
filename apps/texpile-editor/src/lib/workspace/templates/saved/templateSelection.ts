// Which of a project's files "Save as template" copies, and the checks around it: the name clash,
// the size worth asking about, the format a template opens in.
import { isBuildArtifact } from '$lib/workspace/buildArtifacts';
import type { ProjectSurvey, UserTemplate } from '../templateBridge.types';

/** above this, saving asks first: a template is copied again into every project made from it */
export const TEMPLATE_WARN_BYTES = 20 * 1024 * 1024;

// what an OS or an editor leaves in a folder: Finder's metadata, Explorer's thumbnails, macOS
// resource forks on shared drives, backup copies
const OS_LEFTOVER = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*|[^/]*~)$/i;

export type TemplateSelection = {
	/** root-relative, forward-slashed */
	files: string[];
	bytes: number;
};

/**
 * The surveyed files minus compile scratch (the one list in buildArtifacts.ts), OS leftovers, and
 * the main file's compiled PDF - which a template would only carry as a stale copy of itself. Any
 * other PDF stays: a figure is often one.
 */
export function selectTemplateFiles(survey: ProjectSurvey, outputPdf: string | null): TemplateSelection {
	const skipPdf = outputPdf?.toLowerCase() ?? null;
	const kept = survey.files.filter((f) => !isBuildArtifact(f.path) && !OS_LEFTOVER.test(f.path) && f.path.toLowerCase() !== skipPdf);
	return { files: kept.map((f) => f.path), bytes: kept.reduce((sum, f) => sum + f.size, 0) };
}

export function templateLangOf(mainFile: string): 'latex' | 'typst' {
	return /\.typ$/i.test(mainFile) ? 'typst' : 'latex';
}

/** the saved template already called `name`, ignoring case and outer spaces, other than `exceptId` */
export function templateNamed(list: readonly UserTemplate[], name: string, exceptId?: string): UserTemplate | undefined {
	const wanted = name.trim().toLocaleLowerCase();
	return list.find((t) => t.id !== exceptId && t.name.trim().toLocaleLowerCase() === wanted);
}

export function templateSizeText(bytes: number): string {
	return bytes >= 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
