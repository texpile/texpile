// a picture no engine has drawn, on the canvas: the shapes icon, its kind and what it holds, in a dashed box
import { faceElement, iconContent, setLook, type FaceElement } from '$lib/editor/canvas';

export function figurePlaceholderFace(title: string, summary: string): FaceElement {
	const box = faceElement('div', 'figure-placeholder');
	setLook(box, {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 'calc(var(--spacing) * 1)',
		width: '100%',
		height: 'calc(var(--spacing) * 36)',
		border: '1px dashed var(--color-surface-300-700)',
		borderRadius: 'var(--radius-base)',
		color: 'var(--muted-text)'
	});
	const icon = box.appendChild(faceElement('span', 'figure-placeholder-icon'));
	icon.replaced = iconContent('shapes', 24);
	setLook(icon, { width: '24px', height: '24px' });
	const name = box.appendChild(faceElement('span', 'figure-placeholder-title', title));
	setLook(name, { color: 'var(--color-surface-950-50)', fontSize: 'var(--text-sm)', fontWeight: '600' });
	if (summary) setLook(box.appendChild(faceElement('span', 'figure-placeholder-summary', summary)), { fontSize: 'var(--text-xs)' });
	return box;
}
