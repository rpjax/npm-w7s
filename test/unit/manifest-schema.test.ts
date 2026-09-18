import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateManifest } from "../../src/manifest/schema.js";
import { W7sError } from "../../src/errors/index.js";

function validManifest(): Record<string, unknown> {
  return {
    modifications: [
      {
        name: "runtime",
        description: "runtime",
        type: "files",
        files: [{ localPath: "./a.cpp", geckoPath: "a.cpp" }],
        replacesGeckoSource: false,
      },
    ],
    tests: [
      {
        name: "smoke",
        description: "smoke",
        entryPoint: "./t.sh",
        runner: "bash",
        workingDirectory: "/gecko-source",
        classification: "diagnostic",
        dependsOn: ["gecko-source"],
        verifies: "build-output",
      },
    ],
  };
}

function assertManifestRejects(value: unknown): void {
  assert.throws(
    () => validateManifest(value),
    (err: unknown) => err instanceof W7sError && err.phase === "Manifest",
  );
}

describe("manifest schema", () => {
  it("accepts a valid manifest", () => {
    assert.doesNotThrow(() => validateManifest(validManifest()));
  });

  describe("required root fields", () => {
    for (const field of ["modifications", "tests"] as const) {
      it(`rejects missing ${field}`, () => {
        const m = validManifest();
        delete m[field];
        assertManifestRejects(m);
      });
    }
  });

  describe("required directory modification fields", () => {
    const required = [
      "name",
      "description",
      "type",
      "localPath",
      "geckoPath",
      "replacesGeckoSource",
    ] as const;

    for (const field of required) {
      it(`rejects missing modifications[].${field}`, () => {
        const m = validManifest();
        const mod: Record<string, unknown> = {
          name: "install",
          description: "install",
          type: "directory",
          localPath: "./mods",
          geckoPath: ".",
          replacesGeckoSource: true,
        };
        delete mod[field];
        m.modifications = [mod];
        assertManifestRejects(m);
      });
    }
  });

  describe("required files modification fields", () => {
    const required = ["name", "description", "type", "files", "replacesGeckoSource"] as const;

    for (const field of required) {
      it(`rejects missing modifications[].${field} for files type`, () => {
        const m = validManifest();
        const mod = {
          ...(m.modifications as Record<string, unknown>[])[0]!,
        };
        delete mod[field];
        m.modifications = [mod];
        assertManifestRejects(m);
      });
    }
  });

  describe("required fileMapping fields", () => {
    for (const field of ["localPath", "geckoPath"] as const) {
      it(`rejects missing files[].${field}`, () => {
        const m = validManifest();
        const mapping: Record<string, unknown> = {
          localPath: "./a.cpp",
          geckoPath: "a.cpp",
        };
        delete mapping[field];
        m.modifications = [
          {
            name: "runtime",
            description: "runtime",
            type: "files",
            files: [mapping],
            replacesGeckoSource: false,
          },
        ];
        assertManifestRejects(m);
      });
    }
  });

  describe("required test fields", () => {
    const required = [
      "name",
      "description",
      "entryPoint",
      "runner",
      "workingDirectory",
      "classification",
      "dependsOn",
      "verifies",
    ] as const;

    for (const field of required) {
      it(`rejects missing tests[].${field}`, () => {
        const m = validManifest();
        const test = { ...(m.tests as Record<string, unknown>[])[0]! };
        delete test[field];
        m.tests = [test];
        assertManifestRejects(m);
      });
    }
  });

  describe("wrong types", () => {
    const cases: { label: string; mutate: (m: Record<string, unknown>) => void }[] = [
      { label: "modifications not array", mutate: (m) => (m.modifications = {}) },
      { label: "tests not array", mutate: (m) => (m.tests = "nope") },
      {
        label: "modification.name not string",
        mutate: (m) => {
          (m.modifications as Record<string, unknown>[])[0]!.name = 1;
        },
      },
      {
        label: "modification.description not string",
        mutate: (m) => {
          (m.modifications as Record<string, unknown>[])[0]!.description = false;
        },
      },
      {
        label: "modification.type wrong",
        mutate: (m) => {
          (m.modifications as Record<string, unknown>[])[0]!.type = "patch";
        },
      },
      {
        label: "replacesGeckoSource not boolean",
        mutate: (m) => {
          (m.modifications as Record<string, unknown>[])[0]!.replacesGeckoSource = "yes";
        },
      },
      {
        label: "files not array",
        mutate: (m) => {
          (m.modifications as Record<string, unknown>[])[0]!.files = "a.cpp";
        },
      },
      {
        label: "localPath not string",
        mutate: (m) => {
          (
            (m.modifications as Record<string, unknown>[])[0]!.files as Record<string, unknown>[]
          )[0]!.localPath = 3;
        },
      },
      {
        label: "geckoPath not string",
        mutate: (m) => {
          (
            (m.modifications as Record<string, unknown>[])[0]!.files as Record<string, unknown>[]
          )[0]!.geckoPath = null;
        },
      },
      {
        label: "directory localPath not string",
        mutate: (m) => {
          m.modifications = [
            {
              name: "d",
              description: "d",
              type: "directory",
              localPath: 1,
              geckoPath: ".",
              replacesGeckoSource: true,
            },
          ];
        },
      },
      {
        label: "test.name not string",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.name = 9;
        },
      },
      {
        label: "test.description not string",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.description = [];
        },
      },
      {
        label: "test.entryPoint not string",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.entryPoint = {};
        },
      },
      {
        label: "test.runner not string",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.runner = 0;
        },
      },
      {
        label: "test.workingDirectory not string",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.workingDirectory = false;
        },
      },
      {
        label: "test.classification invalid",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.classification = "nightly";
        },
      },
      {
        label: "test.dependsOn not array",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.dependsOn = "gecko-source";
        },
      },
      {
        label: "test.dependsOn item invalid",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.dependsOn = ["not-an-artifact"];
        },
      },
      {
        label: "test.verifies invalid",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.verifies = "unit";
        },
      },
      {
        label: "test.networkAccess not boolean",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.networkAccess = "true";
        },
      },
      {
        label: "test.timeoutSeconds not number",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.timeoutSeconds = "30";
        },
      },
      {
        label: "test.tags not array",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.tags = "smoke";
        },
      },
      {
        label: "test.extraPackages not array",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.extraPackages = "curl";
        },
      },
      {
        label: "test.arguments not array",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.arguments = "--flag";
        },
      },
      {
        label: "test.environment not object",
        mutate: (m) => {
          (m.tests as Record<string, unknown>[])[0]!.environment = ["A=1"];
        },
      },
    ];

    for (const { label, mutate } of cases) {
      it(`rejects ${label}`, () => {
        const m = validManifest();
        mutate(m);
        assertManifestRejects(m);
      });
    }
  });

  it("rejects an unknown root key", () => {
    const m = validManifest();
    m.engine = "gecko";
    assertManifestRejects(m);
  });

  it("rejects an unknown modification key", () => {
    const m = validManifest();
    (m.modifications as Record<string, unknown>[])[0]!.extra = true;
    assertManifestRejects(m);
  });

  it("rejects an unknown test key", () => {
    const m = validManifest();
    (m.tests as Record<string, unknown>[])[0]!.flaky = true;
    assertManifestRejects(m);
  });
});
