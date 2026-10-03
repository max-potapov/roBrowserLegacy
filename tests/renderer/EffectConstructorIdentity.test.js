import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep asset/network dependencies out; exercise the actual manager and tile factory.
vi.mock('DB/Effects/EffectTable.js', () => ({ default: {} }));
vi.mock('DB/Skills/SkillEffect.js', () => ({ default: {} }));
vi.mock('DB/Skills/SkillUnit.js', () => ({ default: {} }));
vi.mock('DB/Skills/SkillUnitConst.js', () => ({ default: {} }));
vi.mock('DB/Items/ItemEffect.js', () => ({ default: {} }));
vi.mock('Controls/ProcessCommand.js', () => ({ default: {} }));
vi.mock('Core/Events.js', () => ({ default: {} }));
vi.mock('Core/Configs.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/Cylinder.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/StrEffect.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/RsmEffect.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/TwoDEffect.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/ThreeDEffect.js', () => ({ default: {} }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: () => null } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { tick: 1000 } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: {} }));
vi.mock('Audio/SoundManager.js', () => ({ default: {} }));
vi.mock('Preferences/Map.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/QuadHorn.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/Trail.js', () => ({ default: {} }));
vi.mock('Renderer/Effects/WaterfallEffect.js', () => ({ default: {} }));
vi.mock('Engine/SessionStorage.js', () => ({ default: { Entity: { position: [0, 0, 0] } } }));
vi.mock('Preferences/Graphics.js', () => ({ default: {} }));
vi.mock('Utils/WebGL.js', () => ({
	default: {
		createShaderProgram: () => ({
			uniform: { uPosition: 1, uSize: 2, uColor: 3, uModelViewMat: 4, uProjectionMat: 5 },
			attribute: { aPosition: 0 }
		})
	}
}));

import EffectManager from 'Renderer/EffectManager.js';
import createTile from 'Renderer/Effects/FlatColorTile.js';

let sequence = 0;
const params = () => ({
	Init: { ownerAID: 10 },
	Inst: { effectID: 100, persistent: true, repeatEnd: 5000, position: [0, 0, 0] }
});

function pair() {
	const red = createTile(`red-${++sequence}`, { r: 1, g: 0, b: 0 });
	const blue = createTile(`blue-${sequence}`, { r: 0, g: 0, b: 1 });
	const first = new red([0, 0, 0], 1000);
	const second = new blue([1, 0, 0], 1000);
	EffectManager.add(first, params());
	EffectManager.add(second, params());
	return { red, blue, first, second };
}

const gl = Object.fromEntries(
	[
		'createBuffer',
		'bindBuffer',
		'bufferData',
		'useProgram',
		'uniformMatrix4fv',
		'enableVertexAttribArray',
		'vertexAttribPointer',
		'disableVertexAttribArray',
		'uniform3fv',
		'uniform1f',
		'uniform4fv',
		'drawArrays',
		'deleteProgram',
		'deleteBuffer'
	].map(name => [name, vi.fn()])
);

afterEach(() => {
	EffectManager.free(gl);
	vi.clearAllMocks();
});

describe('factory effect identity', () => {
	it('initializes and renders both colors despite identical constructor names', () => {
		const { red, blue } = pair();
		expect(red.name).toBe(blue.name);
		EffectManager.render(gl, new Float32Array(16), new Float32Array(16), null, 1000, true);
		expect(gl.uniform4fv.mock.calls.map(call => call[1])).toEqual([
			[1, 0, 0, 0.5],
			[0, 0, 1, 0.5]
		]);
		expect(gl.drawArrays).toHaveBeenCalledTimes(2);
	});

	it('removes only the requested factory, even with the same owner and effect id', () => {
		const { red, first, second } = pair();
		first.ready = true;
		second.ready = true;
		EffectManager.remove(red, 10, 100);
		expect(first.ready).toBe(false);
		expect(second.ready).toBe(true);
	});

	it('ends repeats only for the requested factory', () => {
		const { red, first, second } = pair();
		// Omit the id to isolate constructor routing from the separate repeat-id bug.
		EffectManager.endRepeat(red, 10);
		expect(first._Params.Inst.persistent).toBe(false);
		expect(first._Params.Inst.repeatEnd).toBe(false);
		expect(second._Params.Inst.persistent).toBe(true);
		expect(second._Params.Inst.repeatEnd).toBe(5000);
	});

	it('retains name-based cleanup for constructors without an explicit identity', () => {
		class NamedEffect {
			free() {
				this.freed = true;
			}
		}
		const effect = new NamedEffect();
		EffectManager.add(effect, params());
		EffectManager.remove(NamedEffect, 10, 100);
		expect(effect.freed).toBe(true);
	});
});
