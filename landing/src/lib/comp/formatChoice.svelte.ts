// the format picked on the home page: the hero's switch and the editing stage's switch show and set the same one
import type { HeroFormat } from './hero/heroScenes';

export const formatChoice = $state<{ current: HeroFormat }>({ current: 'latex' });
