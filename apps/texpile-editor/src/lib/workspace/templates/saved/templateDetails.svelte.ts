// The name-and-description dialog behind "Save as template" (from the File menu and the palette) and
// "Rename" on a saved template in the starter picker. A module singleton like the Cite by DOI
// dialog: it mounts once and any entry point opens it.
import { basename, relativeInside } from '$lib/workspace/fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { gitRemotes } from '$lib/workspace/scm/git';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { requireTemplatesBridge, bridgeErrorText } from '../templateBridge';
import { refreshUserTemplates, renameUserTemplate, userTemplates } from './userTemplateList';
import {
	selectTemplateFiles,
	templateLangOf,
	templateNamed,
	templateSizeText,
	TEMPLATE_WARN_BYTES,
	type TemplateSelection
} from './templateSelection';
import type { UserTemplate } from '../templateBridge.types';

/** what Save as template works from: root-relative paths, forward-slashed */
export type SaveContext = { root: string; mainFile: string; outputPdf: string | null };

type Mode = { kind: 'save'; context: SaveContext } | { kind: 'edit'; template: UserTemplate };

class TemplateDetailsState {
	open = $state(false);
	mode = $state.raw<Mode | null>(null);
	name = $state('');
	description = $state('');
	/** the files a save will copy; null while the folder is still being read */
	selection = $state.raw<TemplateSelection | null>(null);
	/** the folder has more than this many files, too many to be a template at all; 0 when it does not */
	tooMany = $state(0);
	/** the project's Git remote, which can be saved instead of its files; null when it has none */
	remote = $state<string | null>(null);
	source = $state<'files' | 'remote'>('files');
	/** why the dialog cannot go ahead, shown under the fields */
	problem = $state('');
	/** why the folder could not be read; kept apart from problem, which typing a new name clears */
	surveyFailed = $state('');
	busy = $state(false);
	/** every open bumps this, so a survey still running for the last one is dropped */
	private generation = 0;

	async showSave(context: SaveContext): Promise<void> {
		const generation = ++this.generation;
		this.mode = { kind: 'save', context };
		this.name = basename(context.root);
		this.description = '';
		this.selection = null;
		this.tooMany = 0;
		this.remote = null;
		this.source = 'files';
		this.problem = '';
		this.surveyFailed = '';
		this.busy = false;
		this.open = true;
		void refreshUserTemplates();
		void this.findRemote(context.root, generation);
		try {
			const survey = await requireTemplatesBridge().survey(context.root);
			if (generation !== this.generation) return;
			this.tooMany = survey.truncated ? survey.limit : 0;
			this.selection = selectTemplateFiles(survey, context.outputPdf);
		} catch (e) {
			if (generation === this.generation) this.surveyFailed = bridgeErrorText(e);
		}
	}

	private async findRemote(root: string, generation: number): Promise<void> {
		const res = await gitRemotes(root);
		// a repository above the project would clone far more than the project
		if (generation !== this.generation || !res.ok || !res.atTopLevel) return;
		const remotes = res.remotes ?? [];
		this.remote = (remotes.find((r) => r.name === 'origin') ?? remotes[0])?.url ?? null;
	}

	showEdit(template: UserTemplate): void {
		this.generation++;
		this.mode = { kind: 'edit', template };
		this.name = template.name;
		this.description = template.description;
		this.selection = null;
		this.tooMany = 0;
		this.problem = '';
		this.surveyFailed = '';
		this.busy = false;
		this.open = true;
	}

	hide(): void {
		this.generation++;
		this.open = false;
		this.mode = null;
	}

	get canSubmit(): boolean {
		if (this.busy || !this.name.trim()) return false;
		if (this.mode?.kind === 'edit') return true;
		return this.source === 'remote' ? !!this.remote : !!this.selection && !this.tooMany;
	}

	/** busy from the first moment, so a second Enter during a confirmation cannot save twice */
	async submit(): Promise<void> {
		const mode = this.mode;
		if (!mode || !this.canSubmit) return;
		this.busy = true;
		try {
			if (mode.kind === 'edit') await this.submitEdit(mode.template);
			else await this.submitSave(mode.context);
		} finally {
			this.busy = false;
		}
	}

	private async submitEdit(template: UserTemplate): Promise<void> {
		const name = this.name.trim();
		if (templateNamed(userTemplates.current, name, template.id)) {
			this.problem = m.template_name_taken({ name });
			return;
		}
		try {
			await renameUserTemplate(template.id, name, this.description);
			this.hide();
		} catch (e) {
			this.problem = bridgeErrorText(e);
		}
	}

	private async submitSave(context: SaveContext): Promise<void> {
		const remote = this.source === 'remote' ? this.remote : null;
		const files = remote ? [] : this.selection?.files;
		const name = this.name.trim();
		if (!files) return;
		await refreshUserTemplates();
		const clash = templateNamed(userTemplates.current, name);
		const cancelLabel = m.menubar_prompt_cancel();
		if (
			clash &&
			!(await confirmAsk(m.template_replace_confirm({ name: clash.name }), {
				confirmLabel: m.filetree_replace(),
				cancelLabel,
				danger: true
			}))
		)
			return;
		const bytes = remote ? 0 : (this.selection?.bytes ?? 0);
		if (
			bytes > TEMPLATE_WARN_BYTES &&
			!(await confirmAsk(m.template_large_confirm({ size: templateSizeText(bytes) }), {
				confirmLabel: m.template_save_anyway(),
				cancelLabel
			}))
		)
			return;
		try {
			await requireTemplatesBridge().save({
				root: context.root,
				files,
				name,
				description: this.description,
				lang: templateLangOf(context.mainFile),
				mainFile: context.mainFile,
				replaceId: clash?.id,
				...(remote ? { remote } : {})
			});
			await refreshUserTemplates();
			this.hide();
			toaster.success({ title: m.template_saved({ name }), description: m.template_saved_where() });
		} catch (e) {
			toaster.error({ title: m.template_save_failed(), description: bridgeErrorText(e) });
		}
	}
}

export const templateDetails = new TemplateDetailsState();

/**
 * File > Save as template, for the project at `root` as it is on disk once `flush` has written the
 * pending edits. `main` is the file a project made from the template opens on; `outputPdf` is its
 * compiled PDF, left out of the copy.
 */
export async function openSaveAsTemplate(
	root: string | null,
	main: string | null,
	outputPdf: string | null,
	flush: () => Promise<void>
): Promise<void> {
	const mainFile = root && main && /\.(tex|typ)$/i.test(main) ? relativeInside(root, main) : null;
	if (!root || !mainFile) {
		toaster.error({ title: m.template_save_failed(), description: m.template_save_no_main() });
		return;
	}
	await flush();
	await templateDetails.showSave({ root, mainFile, outputPdf: outputPdf ? relativeInside(root, outputPdf) : null });
}
