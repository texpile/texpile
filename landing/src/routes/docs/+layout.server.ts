import { navTree } from '$lib/docs/content.server';

export const load = () => ({ nav: navTree() });
