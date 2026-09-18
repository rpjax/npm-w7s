import { readFileSync } from "node:fs";
import { fail } from "../errors/index.js";
import type { W7sManifest } from "./types.js";

export function loadManifest(manifestPath: string): W7sManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (err) {
    fail("Manifest", `Unable to read ${manifestPath}.`, { cause: err });
  }

  try {
    return JSON.parse(raw!) as W7sManifest;
  } catch (err) {
    fail("Manifest", `${manifestPath} is not valid JSON.`, {
      cause: err,
      hint: "Validate the file with a JSON linter or w7s gecko validate.",
    });
  }
}
