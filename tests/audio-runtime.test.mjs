import test from "node:test";
import assert from "node:assert/strict";

import {
  BASS_GAIN,
  DEFAULT_MELODY_SOUND,
  MASTER_GAIN,
  MASTER_LIMITER_THRESHOLD_DB,
  MELODY_EMPHASIS_GAIN,
  MELODY_GAIN,
  MELODY_SAMPLE_INSTRUMENTS,
  MIDI_INPUT_ATTACK_SECONDS,
  MIDI_INPUT_RELEASE_SECONDS,
  PIANO_RELEASE_SETTLE_MULTIPLIER,
  PIANO_RELEASE_TIME_CONSTANT_HIGH_SECONDS,
  PIANO_RELEASE_TIME_CONSTANT_LOW_SECONDS,
  SYNTHETIC_MELODY_GAIN,
  createAudioRuntime,
  keyboardMidiNotes,
  normalizeMelodySound,
  pianoReleaseProfile,
} from "../src/audio-runtime.js";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }

  setTargetAtTime(value, time, timeConstant) {
    this.events.push(["target", value, time, timeConstant]);
  }
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
    this.listeners = new Map();
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeScheduledSource extends FakeAudioNode {
  constructor() {
    super();
    this.startCalls = [];
    this.stopCalls = [];
    this.playbackRate = new FakeAudioParam(1);
  }

  start(...args) {
    this.startCalls.push(args);
  }

  stop(...args) {
    this.stopCalls.push(args);
  }
}

class FakeAudioContext {
  constructor({
    currentTime = 10,
    sampleRate = 1000,
    decodedDuration = 1,
    suspended = false,
  } = {}) {
    this.currentTime = currentTime;
    this.sampleRate = sampleRate;
    this.decodedDuration = decodedDuration;
    this.state = suspended ? "suspended" : "running";
    this.destination = new FakeAudioNode();
    this.oscillators = [];
    this.gains = [];
    this.sources = [];
    this.filters = [];
    this.compressors = [];
    this.buffers = [];
    this.decodeCalls = [];
    this.resumeCalls = 0;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = "running";
  }

  createOscillator() {
    const oscillator = new FakeScheduledSource();
    oscillator.frequency = { value: 0 };
    oscillator.type = "";
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = new FakeAudioNode();
    gain.gain = new FakeAudioParam(1);
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = new FakeScheduledSource();
    source.buffer = null;
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = new FakeAudioNode();
    filter.type = "";
    filter.frequency = { value: 0 };
    filter.Q = { value: 0 };
    this.filters.push(filter);
    return filter;
  }

  createDynamicsCompressor() {
    const compressor = new FakeAudioNode();
    compressor.threshold = new FakeAudioParam(-24);
    compressor.knee = new FakeAudioParam(30);
    compressor.ratio = new FakeAudioParam(12);
    compressor.attack = new FakeAudioParam(0.003);
    compressor.release = new FakeAudioParam(0.25);
    this.compressors.push(compressor);
    return compressor;
  }

  createBuffer(channels, frameCount, sampleRate) {
    const channelData = Array.from(
      { length: channels },
      () => new Float32Array(frameCount),
    );
    const buffer = {
      sampleRate,
      duration: frameCount / sampleRate,
      getChannelData(channel) {
        return channelData[channel];
      },
    };
    this.buffers.push(buffer);
    return buffer;
  }

  async decodeAudioData(bytes) {
    this.decodeCalls.push(bytes);
    return {
      duration: this.decodedDuration,
      decodedFrom: bytes,
    };
  }
}

function okResponse(bytes = new ArrayBuffer(4)) {
  return {
    ok: true,
    async arrayBuffer() {
      return bytes;
    },
  };
}

function makeRuntime({
  context = new FakeAudioContext(),
  fetchImpl = async () => okResponse(),
  initialMelodySound = DEFAULT_MELODY_SOUND,
  translate = (key, values) =>
    values
      ? `${key}:${values.instrument ?? ""}:${values.status ?? ""}`
      : key,
  random = () => 0.75,
} = {}) {
  return {
    context,
    runtime: createAudioRuntime({
      audioContextFactory: () => context,
      fetchImpl,
      baseUrl: "https://example.test/app/",
      translate,
      random,
      initialMelodySound,
    }),
  };
}

test("le runtime expose et valide les trois sons de mélodie", () => {
  assert.deepEqual(Object.keys(MELODY_SAMPLE_INSTRUMENTS), [
    "clarinet",
    "piano",
  ]);
  assert.deepEqual(MELODY_SAMPLE_INSTRUMENTS.clarinet, {
    labelKey: "instrument.clarinet",
    minMidi: 50,
    maxMidi: 92,
    headSeconds: 0.025,
    fileExtension: "mp3",
  });
  assert.deepEqual(MELODY_SAMPLE_INSTRUMENTS.piano, {
    labelKey: "instrument.piano",
    minMidi: 36,
    maxMidi: 96,
    headSeconds: 0,
    fileExtension: "ogg",
  });
  assert.deepEqual(
    keyboardMidiNotes({ startMidi: 60, endMidi: 63 }),
    [60, 61, 62, 63],
  );
  assert.equal(normalizeMelodySound("synthetic"), "synthetic");
  assert.equal(normalizeMelodySound("clarinet"), "clarinet");
  assert.equal(normalizeMelodySound("piano"), "piano");
  assert.equal(normalizeMelodySound("unknown"), DEFAULT_MELODY_SOUND);
});

test("le son synthétique conserve oscillateurs, enveloppes et fallback", () => {
  const context = new FakeAudioContext({ suspended: true });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "clarinet",
  });

  runtime.playTone(69, 0.5, 0.48, false);

  assert.equal(context.resumeCalls, 1);
  assert.equal(context.oscillators.length, 2);
  assert.equal(context.sources.length, 0);
  assert.equal(context.oscillators[0].type, "triangle");
  assert.equal(context.oscillators[0].frequency.value, 440);
  assert.equal(context.oscillators[1].type, "sine");
  assert.equal(context.oscillators[1].frequency.value, 880);
  assert.deepEqual(context.oscillators[0].startCalls, [[10.5]]);
  assert.deepEqual(context.oscillators[0].stopCalls, [[11]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.5],
    ["exponential", SYNTHETIC_MELODY_GAIN, 10.512],
    ["set", SYNTHETIC_MELODY_GAIN, 10.945],
    ["exponential", 0.0001, 10.98],
  ]);
  assert.equal(context.gains.at(-1).gain.value, MASTER_GAIN);
  assert.equal(context.compressors.length, 1);
  assert.equal(
    context.compressors[0].threshold.value,
    MASTER_LIMITER_THRESHOLD_DB,
  );
  assert.equal(context.compressors[0].ratio.value, 20);
  assert.equal(runtime.activeSourceCount(), 2);
  context.oscillators[0].emit("ended");
  assert.equal(runtime.activeSourceCount(), 1);
});

test("la saisie MIDI démarre immédiatement et tient jusqu’au note-off", () => {
  const context = new FakeAudioContext();
  const { runtime } = makeRuntime({ context });

  runtime.prepareInputAudio();
  const tone = runtime.startInputTone(69, 0.5);
  const oscillator = context.oscillators[0];
  const inputGain = context.gains[1];
  const volume = SYNTHETIC_MELODY_GAIN * 0.625;

  assert.deepEqual(oscillator.startCalls, [[10]]);
  assert.deepEqual(oscillator.stopCalls, []);
  assert.equal(runtime.activeInputToneCount(), 1);
  assert.deepEqual(inputGain.gain.events, [
    ["set", 0.0001, 10],
    ["exponential", volume, 10 + MIDI_INPUT_ATTACK_SECONDS],
  ]);

  context.currentTime = 10.2;
  runtime.stopInputTone(tone);
  runtime.stopInputTone(tone);
  assert.equal(runtime.activeInputToneCount(), 0);
  assert.deepEqual(inputGain.gain.events.slice(2), [
    ["set", volume, 10.2],
    ["exponential", 0.0001, 10.2 + MIDI_INPUT_RELEASE_SECONDS],
  ]);
  assert.deepEqual(oscillator.stopCalls, [
    [10.2 + MIDI_INPUT_RELEASE_SECONDS + 0.005],
  ]);
});

test("la saisie MIDI reprend la clarinette sélectionnée", async () => {
  const context = new FakeAudioContext({ decodedDuration: 2 });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "clarinet",
  });
  await runtime.loadMelodySample(69);

  const tone = runtime.startInputTone(69, 0.5);
  const source = context.sources[0];
  const inputGain = context.gains[0];
  const volume = MELODY_GAIN * 0.625;

  assert.equal(tone.sound, "clarinet");
  assert.equal(context.oscillators.length, 0);
  assert.ok(source.buffer);
  assert.deepEqual(source.playbackRate.events, [["set", 1, 10]]);
  assert.deepEqual(source.startCalls, [[10, 0.025]]);
  assert.deepEqual(inputGain.gain.events, [
    ["set", 0.0001, 10],
    ["exponential", volume, 10 + MIDI_INPUT_ATTACK_SECONDS],
  ]);

  context.currentTime = 10.2;
  runtime.stopInputTone(tone);
  assert.deepEqual(inputGain.gain.events.slice(2), [
    ["set", volume, 10.2],
    ["exponential", 0.0001, 10.2 + MIDI_INPUT_RELEASE_SECONDS],
  ]);
  assert.deepEqual(source.stopCalls, [
    [10.2 + MIDI_INPUT_RELEASE_SECONDS + 0.005],
  ]);
});

test("la saisie MIDI reprend le piano et sa release adaptative", async () => {
  const context = new FakeAudioContext({ decodedDuration: 2 });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "piano",
  });
  await runtime.loadMelodySample(60);

  const tone = runtime.startInputTone(60, 0.5);
  const source = context.sources[0];
  const inputGain = context.gains[0];
  const volume = MELODY_GAIN * 0.625;
  const { timeConstant } = pianoReleaseProfile(60, volume, 0);

  assert.equal(tone.sound, "piano");
  assert.equal(context.oscillators.length, 0);
  assert.deepEqual(source.startCalls, [[10, 0]]);

  context.currentTime = 10.2;
  runtime.stopInputTone(tone);
  const releaseEnd =
    10.2 + timeConstant * PIANO_RELEASE_SETTLE_MULTIPLIER;
  assert.deepEqual(inputGain.gain.events.slice(2, 4), [
    ["set", volume, 10.2],
    ["target", 0.0001, 10.2, timeConstant],
  ]);
  assert.deepEqual(inputGain.gain.events[4], ["set", 0, releaseEnd]);
  assert.deepEqual(source.stopCalls, [[releaseEnd]]);
});

test("les samples de mélodie sont dédupliqués, mis en cache et transposés", async () => {
  const fetched = [];
  const context = new FakeAudioContext({ decodedDuration: 1 });
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "clarinet",
    fetchImpl: async (url) => {
      fetched.push(url.toString());
      return okResponse();
    },
  });

  assert.equal(runtime.melodySampleMidi(49), 61);
  const firstLoad = runtime.loadMelodySample(49);
  const duplicateLoad = runtime.loadMelodySample(61);
  assert.strictEqual(firstLoad, duplicateLoad);
  await Promise.all([firstLoad, duplicateLoad]);
  await runtime.preloadMelodySamples([49, 61]);
  assert.deepEqual(fetched, [
    "https://example.test/app/audio/clarinet/61.mp3",
  ]);
  assert.equal(context.decodeCalls.length, 1);

  runtime.playTone(49, 0.2, 0.48, true);
  const source = context.sources[0];
  assert.equal(source.playbackRate.events[0][1], 0.5);
  assert.deepEqual(source.startCalls, [[10.2, 0.025]]);
  assert.deepEqual(source.stopCalls, [[10.7]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.2],
    ["exponential", MELODY_EMPHASIS_GAIN, 10.206],
    ["set", MELODY_EMPHASIS_GAIN, 10.645],
    ["exponential", 0.0001, 10.68],
  ]);
});

test("le piano reprend la release exponentielle adaptative de SharpEleven", async () => {
  const lowProfile = pianoReleaseProfile(45, 0, 1);
  const highProfile = pianoReleaseProfile(89, 0, 1);
  assert.equal(lowProfile.timeConstant, PIANO_RELEASE_TIME_CONSTANT_LOW_SECONDS);
  assert.equal(highProfile.timeConstant, PIANO_RELEASE_TIME_CONSTANT_HIGH_SECONDS);
  assert.equal(Number(lowProfile.fadeBefore.toFixed(3)), 0.18);
  assert.equal(Number(highProfile.fadeBefore.toFixed(3)), 0.135);
  assert.equal(
    pianoReleaseProfile(45, 0, 0).fadeBefore,
    PIANO_RELEASE_TIME_CONSTANT_LOW_SECONDS * 0.9,
  );

  const context = new FakeAudioContext({ decodedDuration: 2 });
  const fetched = [];
  const { runtime } = makeRuntime({
    context,
    initialMelodySound: "piano",
    fetchImpl: async (url) => {
      fetched.push(url.toString());
      return okResponse();
    },
  });
  await runtime.loadMelodySample(60);
  assert.deepEqual(fetched, [
    "https://example.test/app/audio/piano/60.ogg",
  ]);
  const playbackEnd = runtime.playTone(60, 0.2, 0.48);

  const source = context.sources[0];
  const gainEvents = context.gains[0].gain.events;
  const profile = pianoReleaseProfile(60, MELODY_GAIN, 0.48);
  const noteEnd = 10.68;
  const release = noteEnd - profile.fadeBefore;
  const releaseEnd = Math.max(
    noteEnd,
    release + profile.timeConstant * PIANO_RELEASE_SETTLE_MULTIPLIER,
  );

  assert.deepEqual(source.startCalls, [[10.2, 0]]);
  assert.ok(releaseEnd > noteEnd);
  assert.ok(Math.abs(playbackEnd - (releaseEnd - 10)) < 1e-12);
  assert.ok(Math.abs(source.stopCalls[0][0] - releaseEnd) < 1e-12);
  assert.deepEqual(gainEvents.slice(0, 2), [
    ["set", 0.0001, 10.2],
    ["exponential", MELODY_GAIN, 10.206],
  ]);
  assert.equal(gainEvents[2][0], "set");
  assert.ok(Math.abs(gainEvents[2][2] - release) < 1e-12);
  assert.equal(gainEvents[3][0], "target");
  assert.equal(gainEvents[3][1], 0.0001);
  assert.ok(Math.abs(gainEvents[3][2] - release) < 1e-12);
  assert.equal(gainEvents[3][3], profile.timeConstant);
  assert.deepEqual(gainEvents[4], ["set", 0, releaseEnd]);
});

test("un chargement échoué est retenté et garde le message traduit", async () => {
  let attempt = 0;
  const { runtime } = makeRuntime({
    initialMelodySound: "piano",
    fetchImpl: async () => {
      attempt += 1;
      return attempt === 1
        ? {
            ok: false,
            status: 503,
          }
        : okResponse();
    },
  });

  await assert.rejects(
    runtime.loadMelodySample(60),
    /error\.melodySampleUnavailable:instrument\.piano:503/,
  );
  await runtime.loadMelodySample(60);
  assert.equal(attempt, 2);
});

test("la basse conserve son cache, son gain et ses durées", async () => {
  const fetched = [];
  const context = new FakeAudioContext({ decodedDuration: 0.5 });
  const { runtime } = makeRuntime({
    context,
    fetchImpl: async (url) => {
      fetched.push(url.toString());
      return okResponse();
    },
  });

  runtime.playBass(36, 0, 1);
  assert.equal(context.sources.length, 0);

  await runtime.preloadBassSamples([
    { midi: 36 },
    { midi: 36 },
  ]);
  await runtime.loadBassSample(36);
  assert.deepEqual(fetched, [
    "https://example.test/app/audio/bass/36.mp3",
  ]);

  runtime.playBass(36, 0.2, 2);
  const source = context.sources[0];
  assert.deepEqual(source.startCalls, [[10.2]]);
  assert.deepEqual(source.stopCalls, [[10.719999999999999]]);
  assert.deepEqual(context.gains[0].gain.events, [
    ["set", 0.0001, 10.2],
    ["exponential", BASS_GAIN, 10.205],
    ["set", BASS_GAIN, 10.625],
    ["exponential", 0.0001, 10.7],
  ]);
});

test("le chick réutilise son buffer et les sources peuvent toutes être arrêtées", () => {
  const context = new FakeAudioContext();
  const { runtime } = makeRuntime({ context });

  runtime.playChick(0.1);
  runtime.playChick(0.2);

  assert.equal(context.buffers.length, 1);
  assert.equal(context.buffers[0].getChannelData(0)[0], 0.5);
  assert.equal(context.filters[0].type, "highpass");
  assert.equal(context.filters[0].frequency.value, 5200);
  assert.equal(context.filters[0].Q.value, 0.7);
  assert.equal(runtime.activeSourceCount(), 2);

  context.sources[0].stop = () => {
    throw new Error("already stopped");
  };
  assert.doesNotThrow(() => runtime.stopActiveSources());
  assert.equal(runtime.activeSourceCount(), 0);
});
