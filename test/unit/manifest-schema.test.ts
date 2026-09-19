import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateManifest } from "../../src/manifest/schema.js";
import { W7sError } from "../../src/errors/index.js";
import { defaultGecko, defaultToolchain } from "../helpers/fakes.js";

function validManifest(): Record<string, unknown> {
  return {
    gecko: defaultGecko(),
    toolchain: defaultToolchain(),
    modifications: [
      {
        name: "runtime",
        description: "runtime",
        type: "files",
        files: [{ localPath: "./a.cpp", geckoPath: "a.cpp" }],
        replacesGeckoSource: false,
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
    for (const field of ["gecko", "toolchain", "modifications"] as const) {
      it(`rejects missing ${field}`, () => {
        const m = validManifest();
        delete m[field];
        assertManifestRejects(m);
      });
    }
  });

  describe("required gecko fields", () => {
    for (const field of ["version", "repository", "commit"] as const) {
      it(`rejects missing gecko.${field}`, () => {
        const m = validManifest();
        const gecko = { ...(m.gecko as Record<string, unknown>) };
        delete gecko[field];
        m.gecko = gecko;
        assertManifestRejects(m);
      });
    }
  });

  describe("required toolchain fields", () => {
    for (const field of [
      "target",
      "baseImage",
      "aptPackages",
      "rustVersion",
      "sccacheVersion",
    ] as const) {
      it(`rejects missing toolchain.${field}`, () => {
        const m = validManifest();
        const toolchain = { ...(m.toolchain as Record<string, unknown>) };
        delete toolchain[field];
        m.toolchain = toolchain;
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

  describe("wrong types", () => {
    const cases: { label: string; mutate: (m: Record<string, unknown>) => void }[] = [
      { label: "modifications not array", mutate: (m) => (m.modifications = {}) },
      {
        label: "gecko.version not string",
        mutate: (m) => {
          (m.gecko as Record<string, unknown>).version = 1;
        },
      },
      {
        label: "gecko.commit not 40 hex",
        mutate: (m) => {
          (m.gecko as Record<string, unknown>).commit = "not-a-commit";
        },
      },
      {
        label: "toolchain.aptPackages not array",
        mutate: (m) => {
          (m.toolchain as Record<string, unknown>).aptPackages = "git";
        },
      },
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
    m.tests = [];
    assertManifestRejects(m);
  });

  it("rejects an unknown modification key", () => {
    const m = validManifest();
    (m.modifications as Record<string, unknown>[])[0]!.extra = true;
    assertManifestRejects(m);
  });

  it("rejects an unknown gecko key", () => {
    const m = validManifest();
    (m.gecko as Record<string, unknown>).tag = "FIREFOX";
    assertManifestRejects(m);
  });
});
