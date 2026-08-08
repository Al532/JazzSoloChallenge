import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("l’application démarre réellement dans un DOM de navigateur", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });

  const testApi = {};
  for (const [name, value] of Object.entries({
    __DICTEE_MUSICALE_TEST__: testApi,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    navigator: dom.window.navigator,
    screen: dom.window.screen,
    window: dom.window,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }

  dom.window.localStorage.setItem(
    "dictee-musicale.settings.v1",
    JSON.stringify({
      parkerSpeed: 75,
      randomLength: 12,
      selectedPerformers: ["Charlie Parker"],
    }),
  );

  await import(`../src/app.js?smoke=${Date.now()}`);

  assert.equal(dom.window.document.body.classList.contains("home-view"), true);
  assert.equal(dom.window.document.querySelector("#home-panel").hidden, false);
  assert.equal(dom.window.document.querySelector("#game-speed").value, "100");
  assert.deepEqual(
    JSON.parse(
      dom.window.localStorage.getItem("dictee-musicale.settings.v1"),
    ),
    {
      realSpeed: 100,
      realSpeedDefaultRevision: 1,
      developerMode: false,
    },
  );
  assert.equal(
    dom.window.document.querySelector(".developer-home-actions").hidden,
    true,
  );
  const soundSetting = dom.window.document.querySelector(
    ".developer-sound-setting",
  );
  const melodySound = dom.window.document.querySelector("#melody-sound");
  assert.equal(soundSetting.hidden, true);
  assert.equal(melodySound.value, "synthetic");
  assert.equal(testApi.snapshot().effectiveMelodySound, "synthetic");

  melodySound.value = "piano";
  melodySound.dispatchEvent(new dom.window.Event("change"));
  assert.equal(melodySound.value, "synthetic");
  assert.equal(testApi.snapshot().melodySound, "synthetic");
  assert.equal(testApi.snapshot().effectiveMelodySound, "synthetic");

  const developerMode = dom.window.document.querySelector("#developer-mode");
  developerMode.checked = true;
  developerMode.dispatchEvent(new dom.window.Event("change"));
  assert.equal(
    dom.window.document.querySelector(".developer-home-actions").hidden,
    false,
  );
  assert.equal(soundSetting.hidden, false);
  assert.deepEqual(
    JSON.parse(
      dom.window.localStorage.getItem("dictee-musicale.settings.v1"),
    ),
    {
      realSpeed: 100,
      realSpeedDefaultRevision: 1,
      developerMode: true,
    },
  );

  melodySound.value = "piano";
  melodySound.dispatchEvent(new dom.window.Event("change"));
  assert.equal(testApi.snapshot().melodySound, "piano");
  assert.equal(testApi.snapshot().effectiveMelodySound, "piano");
  assert.deepEqual(
    JSON.parse(
      dom.window.localStorage.getItem("dictee-musicale.settings.v1"),
    ),
    {
      realSpeed: 100,
      realSpeedDefaultRevision: 1,
      developerMode: true,
      melodySound: "piano",
    },
  );

  developerMode.checked = false;
  developerMode.dispatchEvent(new dom.window.Event("change"));
  assert.equal(soundSetting.hidden, true);
  assert.equal(testApi.snapshot().melodySound, "piano");
  assert.equal(testApi.snapshot().effectiveMelodySound, "synthetic");
  assert.deepEqual(
    JSON.parse(
      dom.window.localStorage.getItem("dictee-musicale.settings.v1"),
    ),
    {
      realSpeed: 100,
      realSpeedDefaultRevision: 1,
      developerMode: false,
      melodySound: "piano",
    },
  );

  dom.window.close();
});
