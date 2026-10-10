// # The audio worklet
//
// In the browser, sound is produced inside an `AudioWorkletProcessor`: a small program that runs on
// the audio thread and fills 128 samples at a time. Our processor does very little because the
// engine already knows how to make sound. It owns a `Voice`, listens for messages, and in each
// chunk asks for 32 samples at a time.
//
// **This file is not imported.** An audio worklet is a separate scope, and module imports there are
// not available everywhere. `audio.js` instead pastes `pinktrombone.js`, `score.js` and this file
// into one script (stripping `export`) and loads that. The engine code that runs in your browser is
// literally the engine code that the tests run. The names used here (`Voice`, `DEFAULT_FRAME`,
// `normalizeScore`, `frameAt`) come from those files.
//
// ## Messages
//
// - `{ type: 'live', frame }`: hold a sound. The processor glides toward the frame. Use it while a
//   finger or mouse is down.
// - `{ type: 'release' }`: let the held sound fade out.
// - `{ type: 'play', score }`: play a whole score from the start. The processor answers
//   `{ type: 'ended' }` when it is done.
// - `{ type: 'stop' }`: stop at once.
// - `{ type: 'tract', length }`: rebuild the voice with a different tract length (in cm).
const WORKLET_BLOCK = 32;
const WORKLET_TAIL = 0.15;
const GLIDE_SECONDS = 0.02;

class TromboneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.seed = o.seed || 1;
    this.voice = new Voice({ sampleRate, tractLength: o.tractLength, seed: this.seed });
    this.live = { ...DEFAULT_FRAME };
    this.liveTarget = { ...DEFAULT_FRAME };
    this.liveActive = false;
    this.releasing = false;
    this.score = null;
    this.scoreTime = 0;
    this.idle = 0;
    this.block = new Float32Array(WORKLET_BLOCK);
    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  onMessage(msg) {
    if (msg.type === 'live') {
      this.liveTarget = { ...this.liveTarget, ...msg.frame };
      if (!this.liveActive) this.live = { ...this.live, ...msg.frame, intensity: 0 };
      this.liveActive = true;
      this.releasing = false;
      this.score = null;
    } else if (msg.type === 'release') {
      // Voice, breath and hiss all fade out. (A voiceless sound has no voicing to wait for, so the
      // end of the hold is signalled explicitly rather than inferred from the loudness.)
      this.releasing = true;
      this.liveTarget.intensity = 0;
      this.liveTarget.aspiration = 0;
      this.liveTarget.c0n = 0;
      this.liveTarget.c1n = 0;
      this.liveTarget.c0m = 0;
    } else if (msg.type === 'play') {
      this.score = normalizeScore(msg.score);
      this.scoreTime = 0;
      this.liveActive = false;
    } else if (msg.type === 'stop') {
      this.score = null;
      this.liveActive = false;
      this.idle = 0;
    } else if (msg.type === 'tract') {
      this.voice = new Voice({ sampleRate, tractLength: msg.length, seed: this.seed });
    }
  }

  // The frame for the next block, or `null` when there is nothing to say.
  nextFrame() {
    if (this.score) {
      const total = this.score.duration + WORKLET_TAIL;
      if (this.scoreTime >= total) {
        this.score = null;
        this.port.postMessage({ type: 'ended' });
        this.idle = 0;
      } else {
        const f = frameAt(this.score, this.scoreTime);
        this.scoreTime += WORKLET_BLOCK / sampleRate;
        return f;
      }
    }
    if (this.liveActive) {
      const alpha = 1 - Math.exp(-WORKLET_BLOCK / (sampleRate * GLIDE_SECONDS));
      for (const key of Object.keys(this.liveTarget)) {
        this.live[key] += (this.liveTarget[key] - this.live[key]) * alpha;
      }
      if (this.releasing && this.live.intensity < 0.002 && this.live.aspiration < 0.002 && this.live.c0n < 0.002 && this.live.c1n < 0.002) {
        this.liveActive = false;
        this.idle = 0;
      }
      return this.live;
    }
    // Idle: keep the tract ringing out for a moment with the voice off, then fall silent.
    if (this.idle < 0.25 * sampleRate) {
      this.idle += WORKLET_BLOCK;
      return { ...this.live, intensity: 0, aspiration: 0, c0n: 0, c1n: 0 };
    }
    return null;
  }

  process(inputs, outputs) {
    const channels = outputs[0];
    const out = channels[0];
    for (let pos = 0; pos < out.length; pos += WORKLET_BLOCK) {
      const count = Math.min(WORKLET_BLOCK, out.length - pos);
      const f = this.nextFrame();
      if (f === null) {
        for (let i = 0; i < count; i++) out[pos + i] = 0;
        continue;
      }
      this.voice.setFrame(f);
      this.voice.run(out, pos, count);
    }
    for (let c = 1; c < channels.length; c++) channels[c].set(out);
    return true;
  }
}

registerProcessor('trombone', TromboneProcessor);
