/** Camera-relative positional audio. No assets or additional AudioContext. */
export default function initialize(options = {}, api) {
	const { SoundManager: sound, Camera: camera, Session: session } = api || {};
	if (!sound || !camera || !session || sound.spatializer) return false;
	const mode = options?.mode === 'stereo' ? 'equalpower' : 'HRTF';
	const active = new Set();
	const originalUpdate = camera.update;

	function update(item, smooth = true) {
		const listener = session.Entity?.position;
		if (!listener) return;
		const view = camera.modelView;
		const dx = item.position[0] - listener[0];
		const dy = item.position[1] - listener[1];
		const dz = (item.position[2] || 0) - (listener[2] || 0);
		// RO (x, map-y, height) -> renderer (x, -height, map-y).
		// Ignore translation: the listener is the player, not the zoomed-out camera.
		const values = [
			view[0] * dx - view[4] * dz + view[8] * dy,
			view[1] * dx - view[5] * dz + view[9] * dy,
			view[2] * dx - view[6] * dz + view[10] * dy
		];
		[item.node.positionX, item.node.positionY, item.node.positionZ].forEach((param, index) => {
			if (smooth) param.setTargetAtTime(values[index], item.context.currentTime, 0.015);
			else param.value = values[index];
		});
	}

	const spatializer = (context, position) => {
		if (!context.createPanner || !session.Entity) return null;
		const node = context.createPanner();
		node.panningModel = mode;
		// SoundManager already applies RO distance attenuation.
		node.rolloffFactor = 0;
		const item = { node, context, position };
		active.add(item);
		update(item, false);
		return {
			node,
			dispose() {
				active.delete(item);
				node.disconnect();
			}
		};
	};
	sound.spatializer = spatializer;
	const wrappedUpdate = function (...args) {
		const result = originalUpdate.apply(this, args);
		active.forEach(item => update(item));
		return result;
	};
	camera.update = wrappedUpdate;
	initialize.dispose = () => {
		active.forEach(item => item.node.disconnect());
		active.clear();
		if (sound.spatializer === spatializer) sound.spatializer = null;
		if (camera.update === wrappedUpdate) camera.update = originalUpdate;
	};
	return true;
}
