import test from 'node:test';
import assert from 'node:assert/strict';


import { playInSilentMode } from '../lib/audio.js';
test('playInSilentMode asks for a playback audio session where the browser has one', () => {
  const env = { navigator: { audioSession: { type: 'auto' } } };
  assert.equal(playInSilentMode(env), 'audioSession');
  assert.equal(env.navigator.audioSession.type, 'playback');
});
test('playInSilentMode does nothing in browsers that need no help, and never throws', () => {
  assert.equal(playInSilentMode({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux)' } }), null);
  assert.equal(playInSilentMode({}), null);
  assert.equal(playInSilentMode({ navigator: { get audioSession() { throw new Error('no'); } } }), null);
});
