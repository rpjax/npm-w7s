import AjvModule from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "../errors/index.js";
import { type W7sManifest } from "./types.js";

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
      hint: "See schema/w7s.schema.json or docs/11-design-0.2.0.md",
    });
  }
}

/** Schema + semantic validation. Throws W7sError phase Manifest on failure. */
export function validateManifest(manifest: unknown): asserts manifest is W7sManifest {
  validateSchema(manifest);
}
