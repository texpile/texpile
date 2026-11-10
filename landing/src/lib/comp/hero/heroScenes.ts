// the hero's takes, per format: one recording of the app each, and where its parts begin
import { m } from '$lib/paraglide/messages';
import latexVideo from '$lib/assets/hero/tour.mp4';
import latexPoster from '$lib/assets/hero/tour-poster.webp';
import typstVideo from '$lib/assets/hero/typst-tour.mp4';
import typstPoster from '$lib/assets/hero/typst-tour-poster.webp';
import previewVideo from '$lib/assets/hero/live-preview.mp4';
import previewPoster from '$lib/assets/hero/live-preview-poster.webp';

export type HeroFormat = 'latex' | 'typst';
/** a part of a take; `at` is the second it begins */
export type HeroTakePart = { at: number; label: () => string; caption: () => string };
export type HeroTake = { label: string; video: string; poster: string; alt: () => string; parts: HeroTakePart[] };

const part = (at: number, label: () => string, caption: () => string): HeroTakePart => ({ at, label, caption });

export const HERO_TAKES: Record<HeroFormat, HeroTake> = {
	latex: {
		label: 'LaTeX',
		video: latexVideo,
		poster: latexPoster,
		alt: m.hero_shot_alt,
		parts: [
			part(0, m.hero_scene_math_label, m.hero_scene_math_caption),
			part(10, m.hero_scene_figure_label, m.hero_scene_figure_caption),
			part(19, m.hero_scene_cite_label, m.hero_scene_cite_caption),
			part(25, m.hero_scene_source_label, m.hero_scene_source_caption),
			part(33, m.hero_scene_git_label, m.hero_scene_git_caption),
			part(47, m.hero_scene_collab_label, m.hero_scene_collab_caption)
		]
	},
	typst: {
		label: 'Typst',
		video: typstVideo,
		poster: typstPoster,
		alt: m.ty_hero_shot_alt,
		parts: [
			part(0, m.hero_scene_math_label, m.hero_scene_math_caption),
			part(9, m.hero_scene_figure_label, m.hero_scene_typst_figure_caption),
			part(18, m.hero_scene_cite_label, m.hero_scene_cite_caption),
			part(25, m.hero_scene_source_label, m.hero_scene_typst_source_caption),
			part(33, m.hero_scene_git_label, m.hero_scene_git_caption),
			part(45, m.hero_scene_collab_label, m.hero_scene_collab_caption)
		]
	}
};

/** the loop in the live preview section */
export const PREVIEW_LOOP = { video: previewVideo, poster: previewPoster };

/** the size every take was recorded at: a 1280 x 760 window at twice its pixels */
export const SCENE_WIDTH = 2560;
export const SCENE_HEIGHT = 1520;
