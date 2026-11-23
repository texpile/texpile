// a raw block holding pictures the editor cannot model as one figure (subfigures, several \includegraphics): its source
// stays editable, under a strip of the pictures it shows
import { faceElement, setLook, type CanvasNodeViewConstructor, type FaceElement, type ReplacedContent } from '$lib/editor/canvas';
import { editorFileUrl, firstExistingUrl } from '$lib/editor/visual/fileAccess';
import { pictureAt, type Picture } from '$lib/editor/visual/extensions/image/canvas/imagePicture';
import { isRemoteSrc, joinPath } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';
import { graphicPreviews } from './rawFigureGraphics';

function pictureContent(picture: Picture): ReplacedContent {
	return {
		intrinsic: () => (picture.state === 'ready' ? { width: picture.width, height: picture.height } : null),
		paint(ctx, box) {
			if (picture.state === 'ready') ctx.drawImage(picture.image, box.x, box.y, box.width, box.height);
		}
	};
}

function stripOf(text: string, imageDir: () => string, read: (key: string) => void): FaceElement {
	const strip = faceElement('div', 'raw-figure-preview');
	setLook(strip, {
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 'calc(var(--spacing) * 3)',
		padding: 'calc(var(--spacing) * 2)',
		borderBottom: '1px solid var(--color-surface-300-700)'
	});
	const dir = imageDir();
	function resolve(src: string): string {
		return isRemoteSrc(src) || !dir ? src : editorFileUrl(joinPath(dir, src));
	}
	for (const { path, names } of graphicPreviews(text)) {
		const key = `rawfigure\n${dir}\n${path}`;
		read(key);
		const picture = pictureAt(window, key, async () => (await firstExistingUrl(names.map(resolve))) ?? '');
		if (picture.state === 'missing') {
			const note = strip.appendChild(faceElement('span', 'image-missing', m.image_missing_note({ path })));
			setLook(note, { color: 'var(--muted-text)' });
			continue;
		}
		const img = strip.appendChild(faceElement('img', 'raw-figure-picture'));
		img.setAttribute('alt', path);
		img.hint = path;
		img.replaced = pictureContent(picture);
		setLook(img, { maxHeight: '10rem', maxWidth: '100%', borderRadius: 'var(--radius-base)' });
	}
	return strip;
}

/** `island` is the raw block's own source view, which the strip goes over */
export function rawFigureChipView(island: CanvasNodeViewConstructor, imageDir: () => string): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations, inner) => {
		const built = island(node, view, getPos, decorations, inner);
		const shown = graphicPreviews(node.textContent)
			.map((preview) => preview.path)
			.join('|');
		built.dom.prepend(stripOf(node.textContent, imageDir, (key) => view.canvas.build.read({ kind: 'bitmap', source: key }, () => null)));
		const { update } = built;
		built.update = (next, outer, deeper) =>
			graphicPreviews(next.textContent)
				.map((preview) => preview.path)
				.join('|') === shown && !!update?.(next, outer, deeper);
		return built;
	};
}
