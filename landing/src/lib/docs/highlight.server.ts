import { createHighlighter } from 'shiki';

// Build-time only: every docs page prerenders, so this loads once per build and never in the
// browser. The sync API, because markdown-it's highlight hook is sync.
const highlighter = await createHighlighter({ themes: ['github-light'], langs: ['bash', 'powershell', 'toml'] });

/** Shiki's per-token spans, with its inline `<pre>` styling dropped so the site's own pre rule applies. */
export function highlightCode(code: string, lang: string): string {
	return highlighter.codeToHtml(code, { lang, theme: 'github-light' }).replace(/<pre[^>]*>/, '<pre>');
}
