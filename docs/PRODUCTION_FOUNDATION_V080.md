# v0.8.0 — Native security and reproducible distribution foundation

This delivery hardens the consolidated v0.7.9. It does not declare the product stable or replace the existing IDE/CAD/automation document formats. Existing v1 projects are unchanged. No new runtime dependencies or network integrations are added.

## Native trust boundary

`electron/security/boundary.cjs` centralizes sender checks for every named handler. Only the current live main window's own top frame with a parsed, approved URL may invoke privileged methods. Packaged apps ignore the development-server environment override; development only accepts http://127.0.0.1:5173/.

Incoming IPC parameters are bounded to six arguments, 2.2 MB of counted string/key data, 80,000 traversed items and 64 levels. Unsupported types, nonfinite numbers and cyclic structures fail before dispatch. A capacity limit of 32 outstanding data operations has a separate 12-slot control lane so cancellation remains reachable. This is not a memory sandbox: Chromium must still deserialize IPC before the application can validate it. Domain-specific geometry/path/schema checks remain mandatory and unchanged.

Permissions are denied both at request and check time; device access, downloads initiated by web content, remote windows and frame navigation are denied. Production HTML gets a restrictive Content-Security-Policy header without the development loopback allowance. The custom protocol rejects ports, credentials, invalid methods, decoded traversal, backslashes, NUL and Windows alternate-stream syntax.

Starting a workflow now checks all native operation locks, not just the runner/task. Native close refuses to quit during file/CAD/registry commits; after completing the operation, the user can close normally. A renderer termination cancels active execution and stops scheduling rather than silently restarting side effects.

## Local diagnostics, not telemetry

The version label in the existing status bar opens a lazily loaded support dialog. The same command is searchable from the palette. It does not add another navigation menu.

Only application/runtime versions, OS/architecture, process uptime/RSS, boolean protection/operation states and bounded event codes are collected in memory. No raw error message, stack, URL, environment value, username, workspace path, command, document content or token is copied into the report. The 64-record ring and aggregate counters disappear when the process exits.

Export requires a native save-file selection. It creates a new JSON file with exclusive creation; it refuses to overwrite an existing file or follow a link. Reports are not transmitted. Process RSS refers only to the main process, not total Electron RAM. A report is technical evidence, not a security attestation.

## Locked dependency graph and provenance

`package-lock.json` is now tracked. It comes from the dependency resolution archived with the approved v0.7.9 build, with only the root version advanced to 0.8.0. Direct packages are unchanged. CI uses `npm ci`, not a fresh mutable `npm install`. `verify:release` checks direct-version agreement, SHA-512 registry integrity entries, expected packaging protections, and mandatory native-security gates.

This fixes the dependency graph; it does not promise byte-for-byte deterministic Windows executables. Runner patches, timestamps and signing can change bytes. Every package gets its own SHA-256, commit/tree provenance, lock digest and actual toolchain versions in `RELEASE-MANIFEST.json`. `DEPENDENCIES.json` inventories the resolved build dependencies and recorded licenses; it is not a complete legal review or an SPDX/CycloneDX assertion.

## Actual binary hardening

The electron-builder fuse configuration disables Node options environment injection, Node CLI inspection and extra file-protocol privileges. It enables embedded ASAR integrity validation and loading application entry code only from ASAR.

`RunAsNode` intentionally remains enabled: the existing supervised workflow process uses it. Disabling it without migrating the worker would break real automations. Isolation of an OS process is not a sandbox for arbitrary untrusted code. Migrating the worker to an appropriate utility process and then disabling RunAsNode is a separate compatibility/security task.

`verify:packaged-security` reads the real Electron executable fuse bytes through the already resolved @electron/fuses dependency. Both unpacked and installed executables are checked. Existing installed-ASAR worker tests remain, including an actual workflow and extension writing JSON. Authenticode signing is not supplied by a hash or a fuse. Release manifests deliberately do not claim an unperformed signing verification.

## Gates

- Node Linux and Windows, including negative tests for native sender/payload validation, quotas, protocol, denial of permissions and private diagnostic exports.
- Native Electron E2E of actual CSP header, permissions, oversized IPC rejection, diagnostics UI/export/no-overwrite, registry-vs-execution exclusion and close guard.
- Every existing v0.7.9 regression: authoring/history, encrypted recovery/restart, IDE, CAD/DXF, Git, extension grants, tasks, scheduling, bundle and benchmark.
- Binary fuse verification, Setup/Portable execution and installed-ASAR worker operation, source and binary hashes.
- Inspect the real diagnostics screenshot before merging. Keep candidate status until all gates pass for the same code tree.

## Remaining requirements for a stable production declaration

1. Authenticode certificate and verified signing/publishing credentials supplied through protected CI secrets, not source or chat. Trusted update/rollback testing remains a separate delivery; no background updater is introduced here.
2. Complete dependency vulnerability triage, third-party notices/license review and a documented support/update policy. A lock prevents drift; it does not prove dependencies are vulnerability-free.
3. Acceptance/soak tests on representative Windows 10/11 hardware, crash/disk-full scenarios and large real projects. CI smoke tests alone cannot certify all hardware or workload combinations.
4. Review the remaining filesystem TOCTOU and same-user local threat boundaries. OS-user encryption does not protect against another program with that user's privileges.
5. Complete production behavior per module before claiming broader feature parity. This delivery does not implement LSP/DAP, arbitrary shell execution, parametric 3D, full subflows or an unrestricted plugin marketplace.

## Primary references consulted

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron ASAR integrity: https://www.electronjs.org/docs/latest/tutorial/asar-integrity
- electron-builder v26 fuses: https://www.electron.build/v26/docs/tutorials/adding-electron-fuses/
- @electron/fuses v1.8.0 implementation (matches the locked dependency): https://github.com/electron/fuses/tree/v1.8.0
- npm ci (npm 10): https://docs.npmjs.com/cli/v10/commands/npm-ci/

The software stays local-first, experimental and unsigned unless a separately verified signed build is explicitly published.
