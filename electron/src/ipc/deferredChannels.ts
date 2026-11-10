// The channels each step of deferredIpc.ts registers after the window is up, by prefix or whole name; a call to one
// waits for the last step that registers its prefix
export const DEFERRED_STEP_CHANNELS = {
	templates: ['templates:'],
	snippets: ['snippets:'],
	fonts: ['fonts:'],
	git: ['git:', 'github:'],
	localHistory: ['history:'],
	pdfSave: ['draft:savePdf', 'shell:savePdfBytes'],
	exportTarget: ['shell:pickExportTarget'],
	typst: ['typst:'],
	toolchain: ['toolchain:'],
	tinymist: ['typst:'],
	texLive: ['toolchain:'],
	typstPreview: ['typst:'],
	zotero: ['zotero:'],
	doi: ['doi:'],
	agent: ['agent:'],
	acp: ['acp:'],
	terminal: ['terminal:'],
	updates: ['update:'],
	mcp: ['mcp:']
} as const;

export type DeferredStep = keyof typeof DEFERRED_STEP_CHANNELS;

export const DEFERRED_CHANNELS: readonly string[] = [...new Set(Object.values(DEFERRED_STEP_CHANNELS).flat())];
