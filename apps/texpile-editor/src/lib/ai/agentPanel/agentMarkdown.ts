// The agent's replies are Markdown. Raw HTML in them stays text, and a link opens in the browser rather
// than in the window (createWindow's open handler takes any target=_blank)
import markdownit from 'markdown-it';

const md = markdownit({ html: false, linkify: true, typographer: false });

const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	tokens[idx].attrSet('target', '_blank');
	tokens[idx].attrSet('rel', 'noopener noreferrer');
	tokens[idx].attrJoin('class', 'anchor');
	return defaultLinkOpen(tokens, idx, options, env, self);
};

// a table wider than the panel scrolls on its own instead of widening the conversation
md.renderer.rules.table_open = () => '<div class="agent-table"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

export function renderMarkdown(text: string): string {
	return md.render(text);
}
