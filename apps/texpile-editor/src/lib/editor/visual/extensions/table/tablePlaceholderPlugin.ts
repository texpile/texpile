import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export function tablePlaceholderPlugin() {
	return new Plugin({
		props: {
			decorations(state) {
				const decorations: Decoration[] = [];

				state.doc.descendants((node, pos) => {
					if (node.type.name === 'table_caption' && node.content.size === 0) {
						const placeholder = document.createElement('span');
						placeholder.className = 'table-placeholder';
						placeholder.textContent = 'Caption: Click to edit';
						placeholder.style.color = 'var(--faint-text)';
						placeholder.style.fontStyle = 'italic';
						placeholder.style.fontWeight = 'normal';
						decorations.push(Decoration.widget(pos + 1, placeholder));
					}

					if (node.type.name === 'table_notes' && node.content.size === 0) {
						const placeholder = document.createElement('span');
						placeholder.className = 'table-placeholder';
						placeholder.textContent = 'Notes: Click to add notes';
						placeholder.style.color = 'var(--faint-text)';
						placeholder.style.fontStyle = 'italic';
						decorations.push(Decoration.widget(pos + 1, placeholder));
					}
				});

				return DecorationSet.create(state.doc, decorations);
			}
		}
	});
}
