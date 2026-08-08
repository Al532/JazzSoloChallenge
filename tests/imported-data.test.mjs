import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PHRASE_RATINGS } from "../data/default-ratings.js";
import { DEFAULT_PHRASE_SETTINGS } from "../data/default-phrase-settings.js";
import { RECORDING_VALIDATIONS } from "../data/recording-validations.js";

test("l’export du 8 août est intégré aux données embarquées", () => {
  assert.equal(Object.keys(DEFAULT_PHRASE_RATINGS).length, 801);
  assert.equal(Object.keys(DEFAULT_PHRASE_SETTINGS).length, 61);
  assert.equal(Object.keys(RECORDING_VALIDATIONS).length, 98);

  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-135:4"].rating, 2);
  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-16:2"].rating, 2);
  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-344:9"].rating, 2);
  assert.equal(DEFAULT_PHRASE_RATINGS["wjazzd-v2.1-70:6"].rating, 2);
  assert.equal(DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-16:2"].notesMax, 23);
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-241:7"].editedEvents.length,
    17,
  );
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-278:4"].editedEvents.length,
    26,
  );
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-348:25"].editedEvents.length,
    23,
  );
  assert.equal(
    DEFAULT_PHRASE_SETTINGS["wjazzd-v2.1-347:2"].editedEvents.length,
    12,
  );
  assert.deepEqual(RECORDING_VALIDATIONS["wjazzd-v2.1-394"], {
    status: "verified",
    youtubeId: "uxvnQC2FiSs",
    offset: 43,
    updatedAt: "2026-08-02T22:23:41.020Z",
  });
  assert.equal(RECORDING_VALIDATIONS["wjazzd-v2.1-73"].offset, 49.4669);
  assert.equal(
    RECORDING_VALIDATIONS["wjazzd-v2.1-348"].youtubeId,
    "nl_hBPrYclY",
  );
});
