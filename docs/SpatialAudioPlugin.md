# Spatial audio plugin (experimental)

Opt-in camera-relative sound for positional effects, attacks and map ambience.
The plugin uses the client's shared AudioContext and cached buffers. Music and
non-positional UI sounds keep the original path. Distance attenuation stays in
SoundManager and is not applied again by the spatializer. Camera zoom does not
change listener distance. Existing plugins continue to receive their options as
the first argument; the second argument provides SoundManager, Camera and Session.

```js
plugins: {
    SpatialAudio: {
        path: 'SpatialAudio',
        pars: { mode: 'hrtf' }
    }
}
```

Use `mode: 'stereo'` for cheaper equal-power panning. HRTF is intended for
headphones; front/back perception depends on the listener and playback setup.
The plugin is off unless configured. On Vite it loads from src/Plugins.
For the generated Web build, copy src/Plugins/SpatialAudio.js next to Online.js
as SpatialAudio.js; the plugin is a self-contained ESM file with no imports.

Positional sources track the current player position and camera view rotation.
Entity sounds retain their source position reference while playing. Distance
gain is calculated at playback start, matching the existing client behavior.
Natural completion and stop disconnect the extra nodes. Disposing the plugin
restores the camera hook and stops routing new sources through the spatializer;
call SoundManager.stop() first if unloading while sounds are still playing.

Validation: regression tests exercise the real SoundManager with a mocked Web
Audio backend. The local review page also renders generated tones through the
browser's real Web Audio API and measures stereo channel RMS at 0 and 180 degrees.
These fixtures do not establish live-game audio quality or WoE CPU cost.
