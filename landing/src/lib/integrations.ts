// The integration cards shared by the home page and the format pages. A function, not a constant: the
// messages resolve per request, so a module-level list would freeze one locale.
import { m } from '$lib/paraglide/messages';
import type { Integration } from '$lib/comp/IntegrationGrid.svelte';
import citeShot from '$lib/assets/showcase/cite-by-doi.webp';
import publishShot from '$lib/assets/showcase/publish.webp';
import universeShot from '$lib/assets/showcase/universe.webp';

/** the cards for one format's page, or for the home page when no format is given */
export function integrationList(format?: 'latex' | 'typst'): Integration[] {
	const cards: Integration[] = [
		{
			title: m.integ_cite_title(),
			body: m.integ_cite_body(),
			img: citeShot,
			alt: m.integ_cite_alt(),
			docs: '/docs/integrations/cite-by-doi'
		},
		{
			title: m.integ_github_title(),
			body: m.integ_github_body(),
			img: publishShot,
			alt: m.integ_github_alt(),
			docs: '/docs/version-control/github'
		}
	];
	if (format === 'typst')
		cards.unshift({
			title: m.integ_universe_title(),
			body: m.integ_universe_body(),
			img: universeShot,
			alt: m.integ_universe_alt(),
			docs: '/docs/typst/templates'
		});
	return cards;
}
