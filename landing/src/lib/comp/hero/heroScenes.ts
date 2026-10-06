// the screencasts, per format and in playing order; captured and packed by texpile-tools/hero-screencast
import { m } from '$lib/paraglide/messages';
import latexPoster from '$lib/assets/hero/tour-poster.webp';
import typstPoster from '$lib/assets/hero/typst-tour-poster.webp';

export type HeroScene = { name: string; label: () => string; caption: () => string; timeline: string; sprite: string };
export type HeroFormat = 'latex' | 'typst';
/** a part of the hero's take, in the order it was captured */
export type HeroTakePart = { label: () => string; caption: () => string };
export type HeroSceneSet = { label: string; poster: string; alt: () => string; take: HeroScene; parts: HeroTakePart[] };

const timelines = import.meta.glob<string>('$lib/assets/hero/*.json', { query: '?url', import: 'default', eager: true });
const sprites = import.meta.glob<string>('$lib/assets/hero/*.webp', { import: 'default', eager: true });
const asset = (files: Record<string, string>, file: string) => {
	const hit = Object.entries(files).find(([path]) => path.endsWith('/' + file));
	if (!hit) throw new Error(`hero asset missing: ${file}`);
	return hit[1];
};
const scene = (name: string, label: () => string, caption: () => string): HeroScene => ({
	name,
	label,
	caption,
	timeline: asset(timelines, name + '.json'),
	sprite: asset(sprites, name + '.webp')
});

const part = (label: () => string, caption: () => string): HeroTakePart => ({ label, caption });
const partsWith = (source: () => string): HeroTakePart[] => [
	part(m.hero_scene_math_label, m.hero_scene_math_caption),
	part(m.hero_scene_cite_label, m.hero_scene_cite_caption),
	part(m.hero_scene_source_label, source),
	part(m.hero_scene_git_label, m.hero_scene_git_caption),
	part(m.hero_scene_collab_label, m.hero_scene_collab_caption)
];

export const HERO_SETS: Record<HeroFormat, HeroSceneSet> = {
	latex: {
		label: 'LaTeX',
		poster: latexPoster,
		alt: m.hero_shot_alt,
		take: scene('tour', m.hero_scenes_label, m.hero_shot_alt),
		parts: partsWith(m.hero_scene_source_caption)
	},
	typst: {
		label: 'Typst',
		poster: typstPoster,
		alt: m.ty_hero_shot_alt,
		take: scene('typst-tour', m.hero_scenes_label, m.ty_hero_shot_alt),
		parts: partsWith(m.hero_scene_typst_source_caption)
	}
};

/** the loops in the page sections: live preview (the hero no longer has that scene, since every scene shows it) and
 *  collaboration, the hero's own scene again */
type SceneLoopSource = { scene: HeroScene; poster: string };
const loop = (name: string, label: () => string, caption: () => string): SceneLoopSource => ({
	scene: scene(name, label, caption),
	poster: asset(sprites, name + '-poster.webp')
});
export const PREVIEW_SCENES: Record<HeroFormat, SceneLoopSource> = {
	latex: loop('live-preview', m.live_preview_heading, m.live_preview_body),
	typst: loop('typst-live-preview', m.live_preview_heading, m.live_preview_body)
};
export const COLLAB_SCENES: Record<HeroFormat, SceneLoopSource> = {
	latex: loop('collab', m.hero_scene_collab_label, m.hero_scene_collab_caption),
	typst: loop('typst-collab', m.hero_scene_collab_label, m.hero_scene_collab_caption)
};

/** the size every scene was captured at: a 1280 x 760 window at twice its pixels */
export const SCENE_WIDTH = 2560;
export const SCENE_HEIGHT = 1520;
