/**
 * The arithmetic behind pan and zoom, kept free of the DOM so it can be tested.
 *
 * A view is the top-left corner of what is on screen, in map units, and a zoom
 * factor: at `k` the screen shows `width / k` by `height / k` of the map.
 *
 * @typedef {{ x: number, y: number, k: number }} View
 */

/** Past this the simplified outlines are visibly made of straight lines. */
export const MAX_ZOOM = 12;

/** @type {View} */
export const IDENTITY = { x: 0, y: 0, k: 1 };

const clamp = (
	/** @type {number} */ value,
	/** @type {number} */ min,
	/** @type {number} */ max,
) => Math.min(Math.max(value, min), max);

/**
 * Keeps the zoom in range and the map from being dragged off its own canvas.
 *
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @returns {View}
 */
export function clampView(view, width, height) {
	const k = clamp(view.k, 1, MAX_ZOOM);
	return {
		k,
		x: clamp(view.x, 0, width - width / k),
		y: clamp(view.y, 0, height - height / k),
	};
}

/**
 * Zooms by `factor` so the map point (cx, cy) stays under the pointer.
 *
 * @param {View} view
 * @param {number} factor
 * @param {number} cx
 * @param {number} cy
 * @returns {View}
 */
export function zoomAt(view, factor, cx, cy) {
	const k = clamp(view.k * factor, 1, MAX_ZOOM);
	const ratio = view.k / k;
	return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

/**
 * @param {View} view
 * @param {number} dx map units
 * @param {number} dy map units
 * @returns {View}
 */
export function panBy(view, dx, dy) {
	return { ...view, x: view.x + dx, y: view.y + dy };
}
