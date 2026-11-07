import { citationVariantsFor } from '$lib/languages/latex/visual/extensions/citation/citationVariantsFor';
import { refCommandsFor, starredRefCommands } from '$lib/languages/latex/visual/core/references/refCommandsFor';
import { bibStyleNames, bibliographyKindFor } from '$lib/languages/latex/visual/core/references/bibliographyKind';
import type { LoadedFile } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import type { TemplateFeatures } from '$lib/stores/editorStore';

// what the menus offer from the packages the document loads; unnarrowed until those are known
export function packageFeatures(preamble: string, loaded: LoadedFile[] | null): Partial<TemplateFeatures> {
	return {
		citationVariants: loaded ? citationVariantsFor(preamble, loaded) : undefined,
		refCommands: loaded ? refCommandsFor(preamble, loaded) : undefined,
		refStars: loaded ? starredRefCommands(preamble, loaded) : undefined,
		bibliography: loaded ? bibliographyKindFor(preamble, loaded) : undefined,
		bibStyles: loaded ? bibStyleNames(loaded) : undefined
	};
}
