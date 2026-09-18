import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { failurePayload, successPayload } from "../../src/ux/error-panel.js";
import { W7sError } from "../../src/errors/index.js";
import { FakeClock } from "../helpers/fakes.js";

describe("json contract", () => {
  it("success shape always has boolean ok:true", () => {
    const clock = new FakeClock();
    const startedAt = clock.nowMs();
    clock.advance(1400);
    const payload = successPayload(
      "gecko make gecko-source",
      startedAt,
      { filesWritten: 2, filesUnchanged: 43 },
      ["w7s gecko make gecko-binary"],
      { fingerprint: "a3f19c7b21d4" },
    );

    assert.equal(typeof payload.ok, "boolean");
    assert.equal(payload.ok, true);
    assert.equal(payload.command, "gecko make gecko-source");
    assert.equal(typeof payload.elapsedSeconds, "number");
    assert.deepEqual(payload.result, { filesWritten: 2, filesUnchanged: 43 });
    assert.deepEqual(payload.nextSteps, ["w7s gecko make gecko-binary"]);
    assert.equal(payload.fingerprint, "a3f19c7b21d4");
  });

  it("failure shape always has boolean ok:false plus phase and exitCode", () => {
    const clock = new FakeClock();
    const startedAt = clock.nowMs();
    clock.advance(600);
    const err = new W7sError(
      "WorkingTree",
      "3 files in the working tree differ from the manifest.",
      {
        hint: "w7s gecko capture --all --into <modification>",
        detail: ["dom/base/Document.cpp"],
      },
    );
    const payload = failurePayload(err, "gecko make gecko-source", startedAt);

    assert.equal(typeof payload.ok, "boolean");
    assert.equal(payload.ok, false);
    assert.equal(payload.command, "gecko make gecko-source");
    assert.equal(payload.phase, "WorkingTree");
    assert.equal(payload.message, err.message);
    assert.equal(payload.hint, err.hint);
    assert.deepEqual(payload.detail, ["dom/base/Document.cpp"]);
    assert.equal(typeof payload.elapsedSeconds, "number");
    assert.equal(payload.exitCode, 3);
  });

  it("ok is boolean on every phase failure payload", () => {
    const phases = [
      "Cli",
      "Manifest",
      "WorkingTree",
      "Declaration",
      "Toolchain",
      "NotCurrent",
      "Test",
      "Execution",
    ] as const;
    for (const phase of phases) {
      const payload = failurePayload(
        new W7sError(phase, `${phase} failed`),
        "gecko status",
        Date.now(),
      );
      assert.equal(typeof payload.ok, "boolean");
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, phase);
      assert.equal(typeof payload.exitCode, "number");
    }
  });
});
