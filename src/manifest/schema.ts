import AjvModule from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "../errors/index.js";
import {
  isArtifactName,
  releaseGateRunnerAllowed,
  type TestDeclaration,
  type W7sManifest,
} from "./types.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = join(packageRoot, "schema", "w7s.schema.json");

let ajvValidator: ValidateFunction | null = null;

function getSchemaValidator(): ValidateFunction {
  if (!ajvValidator) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AjvCtor = (AjvModule as any).default ?? AjvModule;
    const ajv = new AjvCtor({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    ajvValidator = ajv.compile(schema) as ValidateFunction;
  }
  return ajvValidator!;
}

export function validateSchema(manifest: unknown): void {
  const validate = getSchemaValidator();
  if (!validate(manifest)) {
    const messages = (validate.errors ?? [])
      .map((err: ErrorObject) => {
        const path = err.instancePath || "(root)";
        return `${path}: ${err.message ?? "invalid"}`;
      })
      .join("\n");
    fail("Manifest", "Manifest failed JSON Schema validation.", {
      detail: messages,
      hint: "See schema/w7s.schema.json or docs/02-manifest.md",
    });
  }
}

function validateTestSemantics(test: TestDeclaration, index: number): void {
  const label = `tests[${index}] ("${test.name}")`;

  for (const dep of test.dependsOn) {
    if (!isArtifactName(dep)) {
      fail("Manifest", `${label}.dependsOn contains unknown artifact "${dep}".`, {
        hint: "dependsOn accepts only gecko-source, gecko-binary, sidecar-package.",
      });
    }
  }

  if (test.classification === "release-gate") {
    if (test.extraPackages !== undefined && test.extraPackages.length > 0) {
      fail(
        "Manifest",
        `${label}: release-gate tests may not declare extraPackages.`,
        {
          hint: "Move the test to classification \"diagnostic\", or remove extraPackages.",
        },
      );
    }
    if (test.networkAccess === true) {
      fail("Manifest", `${label}: release-gate tests may not declare networkAccess.`, {
        hint: "Move the test to classification \"diagnostic\", or remove networkAccess.",
      });
    }
    if (!releaseGateRunnerAllowed(test.runner)) {
      fail(
        "Manifest",
        `${label}: release-gate runner "${test.runner}" is not provided by the toolchain image.`,
        {
          hint: "Allowed runners: bash, python3, node, dotnet, clang, g++, cmake, jq.",
        },
      );
    }
  }
}

/** Schema + semantic validation. Throws W7sError phase Manifest on failure. */
export function validateManifest(manifest: unknown): asserts manifest is W7sManifest {
  validateSchema(manifest);
  const typed = manifest as W7sManifest;
  typed.tests.forEach((test, index) => validateTestSemantics(test, index));
}
