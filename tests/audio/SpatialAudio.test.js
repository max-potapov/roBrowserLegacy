import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initialize from 'Plugins/SpatialAudio.js';

const state = vi.hoisted(() => ({
	session: { Entity: { position: [0, 0, 0] } },
	preferences: { Sound: { play: true, volume: 0.5 }, save: vi.fn() },
	context: null
}));
vi.mock('Core/Client.js', () => ({ default: { loadFile: (_file, ok) => ok('fixture.wav') } }));
vi.mock('Core/MemoryManager.js', () => ({ default: { search: () => [], remove() {} } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: state.session }));
vi.mock('Preferences/Audio.js', () => ({ default: state.preferences }));

const parameter = () => ({
	value: 0,
	setTargetAtTime: vi.fn(function (value) {
		this.value = value;
	})
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
let Sound, camera;
beforeEach(async () => {
	vi.resetModules();
	state.session.Entity = { position: [0, 0, 0] };
	state.preferences.Sound.play = true;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }))
	);
	vi.stubGlobal(
		'AudioContext',
		class {
			constructor() {
				state.context = this;
				this.state = 'running';
				this.currentTime = 0;
				this.destination = {};
				this.sources = [];
				this.panners = [];
				this.gains = [];
			}
			decodeAudioData(_bytes, ok) {
				ok({});
			}
			createBufferSource() {
				const source = { ...node(), start: vi.fn(), stop: vi.fn() };
				this.sources.push(source);
				return source;
			}
			createGain() {
				const gain = { ...node(), gain: parameter() };
				this.gains.push(gain);
				return gain;
			}
			createPanner() {
				const panner = { ...node(), positionX: parameter(), positionY: parameter(), positionZ: parameter() };
				this.panners.push(panner);
				return panner;
			}
		}
	);
	Sound = (await import('Audio/SoundManager.js')).default;
	camera = { modelView: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), update: vi.fn() };
});
afterEach(() => {
	Sound.stop();
	initialize.dispose?.();
	vi.unstubAllGlobals();
});
async function play(position, filename = 'fixture.wav') {
	Sound.playPosition(filename, position);
	await new Promise(resolve => setTimeout(resolve, 0));
}
function enable(mode = 'hrtf') {
	return initialize({ mode }, { SoundManager: Sound, Camera: camera, Session: state.session });
}

describe('spatial audio plugin', () => {
	it('leaves the default audio graph unchanged when not enabled', async () => {
		await play([5, 0, 0]);
		expect(state.context.panners).toHaveLength(0);
		expect(state.context.gains[0].connect).toHaveBeenCalledWith(state.context.destination);
	});
	it('adds HRTF only to positional sources and preserves attenuation', async () => {
		expect(enable()).toBe(true);
		await play([5, 0, 0]);
		const panner = state.context.panners[0];
		expect(panner.panningModel).toBe('HRTF');
		expect(panner.rolloffFactor).toBe(0);
		expect(panner.positionX.value).toBe(5);
		expect(state.context.gains[0].gain.value).toBeCloseTo((1 - ((4 * 0.99) / 24 + 0.01)) * 0.5);
		expect(panner.connect).toHaveBeenCalledWith(state.context.destination);
	});
	it('keeps UI sounds centered while the plugin is enabled', async () => {
		enable();
		Sound.play('ui.wav');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(state.context.panners).toHaveLength(0);
	});
	it('follows a camera turn and a moving source without using camera translation', async () => {
		enable();
		const position = [5, 0, 0];
		await play(position);
		const panner = state.context.panners[0];
		camera.modelView[0] = -1;
		camera.modelView[10] = -1;
		camera.modelView[12] = 1000;
		position[0] = 8;
		state.session.Entity.position[0] = 2;
		camera.update();
		expect(panner.positionX.value).toBe(-6);
		expect(camera.update).not.toBeUndefined();
	});
	it('supports the cheaper equal-power stereo mode', async () => {
		enable('stereo');
		await play([-5, 0, 0]);
		expect(state.context.panners[0].panningModel).toBe('equalpower');
		expect(state.context.panners[0].positionX.value).toBe(-5);
	});
	it('disconnects positional nodes on natural completion and stop', async () => {
		enable();
		await play([5, 0, 0]);
		state.context.sources[0].onended();
		expect(state.context.panners[0].disconnect).toHaveBeenCalledTimes(1);
		await play([-5, 0, 0], 'other.wav');
		Sound.stop('other.wav');
		expect(state.context.panners[1].disconnect).toHaveBeenCalledTimes(1);
	});
	it('restores hooks on disposal and refuses to overwrite another plugin', () => {
		const original = camera.update;
		enable();
		expect(enable()).toBe(false);
		initialize.dispose();
		expect(Sound.spatializer).toBe(null);
		expect(camera.update).toBe(original);
	});
	it('falls back to the original graph without a listener or PannerNode support', async () => {
		enable();
		state.session.Entity = null;
		Sound.play('no-player.wav', 1, [5, 0, 0]);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(state.context.panners).toHaveLength(0);
	});
});
