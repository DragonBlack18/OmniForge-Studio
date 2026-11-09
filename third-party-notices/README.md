# Third-party notice introduced with the IDE expansion

The terminal dependencies introduced in v0.11.0 are listed in
[WORKBENCH-V0110.md](WORKBENCH-V0110.md), with their pinned versions and
upstream license files. SQLite uses the runtime already included by Electron;
better-sqlite3 and SolveSpace are not bundled by this integration.

`monaco-editor-LICENSE.txt` is reproduced without modification from
https://github.com/microsoft/monaco-editor/blob/v0.55.1/LICENSE.txt
for the existing pinned Monaco 0.55.1 component reused by the IDE.
It is included in packaged application resources. OmniForge's own source
license is not changed by this notice.

This directory is not a complete third-party legal audit. The dependency
inventory in release artifacts records the installed locked components.
A full inventory of bundled code, transitive notices and obligations remains
a production gate before a commercial/stable distribution.
