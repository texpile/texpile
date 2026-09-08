import type { AppSettings } from './settings';

export type LocaleMeta = {
	label: string;
};

export const LOCALE_META: Record<AppSettings['uiLocale'], LocaleMeta> = {
	en: { label: 'English' },
	'zh-Hans': { label: '简体中文' },
	'zh-Hant': { label: '繁體中文' },
	de: { label: 'Deutsch' },
	'pt-BR': { label: 'Português (Brasil)' }
};
