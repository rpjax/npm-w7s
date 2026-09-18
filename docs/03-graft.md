# The graft

The graft is our delta against the pinned upstream: the source we own plus the points
where we touch source we do not own. It lives in box 1 and nowhere else.

```
gecko-engine/graft/
  sources/   our C++ that compiles inside Gecko     does NOT exist upstream
  hooks/     injections and patches                  exists upstream
```

The directory split is not decoration — it carries L3 in the tree. A file under
`sources/` that exists at BASE is in the wrong folder, and that is checkable in one
command. `validate` does exactly that.

## Three kinds, and only three

| kind | when | lives in |
|---|---|---|
| `add` | a file that is entirely ours; absent at BASE | `graft/sources/<path in gecko>` |
| `inject` | a hook of one to five lines in an upstream file | `graft/hooks/<path>.inject.json` |
| `patch` | a structural edit too large for an anchor | `graft/hooks/<path>.patch` |

`inject` is the default for hooks, and not by taste: an anchor is text, a hunk is a line
number. When upstream edits *around* the hook, the hunk breaks and the anchor survives.
When upstream edits *the hook itself*, both break — and there you want to break.

`patch` is the escape hatch, not the norm.

### Inject format

One file per target file, an ordered list of edits:

```jsonc
{ "file": "dom/base/Document.cpp",
  "edits": [
    { "id": "cssom-include",
      "after":  "#include \"SpeculumNodeSource.h\"\n",
      "insert": "#include \"SpeculumCssom.h\"\n" },

    { "id": "cssom-rule-added",
      "after":  "void Document::RuleAdded(StyleSheet& aSheet, css::Rule& aRule) {\n  if (aRule.IsIncompleteImportRule()) {\n    return;\n  }\n\n",
      "insert": "  SpeculumNotifyRuleAdded(this, &aSheet, aRule);\n\n" },

    { "id": "rule-changed-name-param",
      "replace": "void Document::RuleChanged(StyleSheet& aSheet, css::Rule*,\n",
      "with":    "void Document::RuleChanged(StyleSheet& aSheet, css::Rule* aRule,\n",
      "why": "the hook needs the parameter named; no behavioural change" }
  ] }
```

Operations: `after`, `before`, `replace` + `with`. Each must match **exactly once** in the
BASE content (L4). Zero or two matches is exit 6, naming the edit `id`.

`why` is optional per edit and recommended whenever the edit is not self-evident, as above:
renaming an unused parameter looks like a gratuitous change until you know a hook needs it.

## The three states

The apply step runs inside the workshop, where `src` lives, reading the graft through a
read-only bind mount. For each managed path:

```
base = content at <BASE>:<path>     (from src's own git; the shallow clone has the blob)
want = desired content, computed IN MEMORY from base + edits
have = bytes currently in src

have == want  ->  write nothing            <- the common case
have == base  ->  write want (atomically)
otherwise     ->  DRIFT: abort, exit 3, name the file
```

This single comparison delivers three things at once.

**Robustness.** The third state is what did not exist before. The predecessor did an
unconditional `cp -f`, so it overwrote local work silently — and for five files it did not
copy at all, which is worse: the divergence sat there, invisible, for months.

**Idempotence for free.** No `grep -q 'SpeculumTryAskDialog'` sentinels, no
`patch --fuzz=0`, no "upgrade the hunk if it looks like the old version" script, no
`|| python3 fallback`.

**Speed.** L2. The predecessor rewrote 32 files before every `mach`, three of which are
detonators: touching `PContent.ipdl` regenerates `PContent.h` and everything that includes
it, and touching a `moz.build` re-runs the build backend. Even with sccache returning
cached objects, the `.o` files get new mtimes and libxul relinks — and the link is the
dominant cost. Content-gated writes turn a full relink into one translation unit.

### Line endings are part of correctness

`want` is computed with normalized LF. This is not hygiene: in the repository this tool
replaces, `cp -f` from a CRLF working copy rewrote `ContentChild.cpp` (10373 changed
lines) and `PContent.ipdl` (4044) in their entirety. Without normalization those two files
would be *permanently* in the drift state, and `sync` would rewrite them on every build.

The repository also needs `.gitattributes` with `text eol=lf`, which is how this very
package is configured.

## The lock

`graft.lock.json` is generated and versioned. Like `package-lock`, except what it pins is
**our expectation about upstream**:

```jsonc
{ "schema": 1,
  "base": "feec67e62a5148b41fd017ccbbc463e8a6f9e83d",
  "delta": "a3f19c",
  "files": {
    "dom/base/SpeculumCssom.cpp": { "kind": "add",    "want": "sha256:…" },
    "dom/base/Document.cpp":      { "kind": "inject", "base": "sha256:…", "want": "sha256:…",
                                    "edits": { "cssom-include": "ok",
                                               "cssom-rule-added": "ok" } }
  } }
```

Three uses:

1. **CI without Gecko.** `validate --offline` checks the manifest, the tree and the lock
   against each other with no clone and no Docker.
2. **Stable identity.** The delta hash comes from the lock, so it is identical on every
   machine and reproducible in CI.
3. **A rebase report.** On `pin --set <tag>` the lock is regenerated and the tool prints
   exactly which `base` hashes moved and which anchors no longer match. An ESR bump stops
   being a leap in the dark and becomes a diff review.

## The delta hash

```
delta = sha256( schema || source.commit || canonical(changes) || sorted(path + want) )[0:6]
```

It travels into `build.json`, the `speculum.gecko.delta` image label, the volume stamps,
and `w7s gecko delta`. It is what makes it possible to look at a container in production
and know exactly which set of Gecko changes is running.

## Adopt

`w7s gecko adopt` is the only sanctioned path from the workspace back to box 1. Given a
divergent file it produces the `graft/hooks` entry — `--as inject` by default, `--as patch`
when asked — and then re-verifies: recompute `want` from BASE plus the new entry and
compare byte for byte against the workspace file. Equal means the conversion is provably
lossless. Unequal means it is incomplete, and the diff shows what is missing.

The same three-state machinery is the verifier. That is the point: the code that runs
every day is the code that proves a migration correct.
