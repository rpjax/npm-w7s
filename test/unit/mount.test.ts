import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dockerHostPath,
  dockerVolumeNameFor,
  dockerVolumeSpec,
  usesDockerVolumeBackend,
} from "../../src/engine/mount.js";
import { FakeEngine } from "../helpers/fakes.js";
import { DockerEngine } from "../../src/engine/docker.js";

describe("docker mounts", () => {
  it("normalizes backslashes for bind -v specs", () => {
    assert.equal(dockerHostPath("C:\\a\\b"), "C:/a/b");
    assert.equal(
      dockerVolumeSpec("\\\\wsl$\\Ubuntu\\root\\x", "/gecko-source"),
      "//wsl$/Ubuntu/root/x:/gecko-source",
    );
  });

  it("FakeEngine keeps bind mounts on Windows drive paths", () => {
    if (process.platform !== "win32") {
      return;
    }
    const fake = new FakeEngine();
    assert.equal(usesDockerVolumeBackend("C:\\tree", fake), false);
    assert.equal(
      dockerVolumeSpec("C:\\tree", "/gecko-source", undefined, fake),
      "C:/tree:/gecko-source",
    );
  });

  it("DockerEngine uses named volumes for Windows .w7s trees only", () => {
    if (process.platform !== "win32") {
      return;
    }
    const docker = new DockerEngine();
    const gecko = "C:\\ws\\.w7s\\gecko\\153.2.0";
    assert.equal(usesDockerVolumeBackend(gecko, docker), true);
    assert.equal(usesDockerVolumeBackend("C:\\ws\\.w7s\\mozconfig\\x.mozconfig", docker), false);
    const name = dockerVolumeNameFor(gecko);
    assert.match(name, /^w7s-[0-9a-f]{12}$/);
    assert.equal(
      dockerVolumeSpec(gecko, "/gecko-source", undefined, docker),
      `${name}:/gecko-source`,
    );
    assert.equal(
      dockerVolumeSpec("C:\\ws\\.w7s\\mozconfig\\x.mozconfig", "/w7s.mozconfig", "ro", docker),
      "C:/ws/.w7s/mozconfig/x.mozconfig:/w7s.mozconfig:ro",
    );
  });
});
