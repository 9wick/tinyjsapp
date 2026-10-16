# Editor assistance for tinyjs.json

The [JSON Schema](schema/tinyjs.schema.json) describes the configuration
fields used by the CLI and runtime. It supplies field descriptions, completion,
and type checks in editors that support JSON Schema Draft 2020-12.

Projects made by `tinyjs new` and `tinyjs wrap` already point at it, in the
first line of `tinyjs.json`:

```json
{
  "$schema": "https://tinyjs.app/schema/tinyjs.schema.json",
  "name": "hello"
}
```

VS Code, JetBrains IDEs, Zed and most other editors pick that up with no
setup. For an older project, add the same line. tinyjs itself ignores the key
and never fetches the schema: the editor does that, and offline it just shows
no hints. The URL always serves the schema for the latest tinyjs release.

## Compatibility and scope

Root fields and partial `macos`, `windows`, and `linux` blocks share the same
definitions. tinyjs merges plain objects recursively; arrays and scalars in
the active platform block replace the root values. Environment signing settings
then take precedence. Unknown fields remain allowed, including nested extension
fields, to support future tinyjs releases and application tooling.

The schema checks documented field shapes; it does not reproduce every implicit
JavaScript coercion. Optional settings that accept `null` retain that option.
It deliberately imposes no version format, bundle ID format, path regex, or
required root `name`: a platform block can provide the name. A schema-valid
fragment is therefore not necessarily a runnable app. The CLI still checks the
resolved name, incompatible options (such as `mainWindow: false` with `url`),
file existence, path safety, native executable formats, and signing credentials.
Validation does not grant or audit API capabilities.

## Verification

`test/config-schema/coverage.py` needs only the standard library. It fails
when `cli.js` or the runtime reads a top-level key the schema doesn't
describe. Nested keys (`chrome.*`, `frontend.*`, ...) aren't covered and have
to be added by hand:

```sh
python3 test/config-schema/coverage.py
```
