# OmniForge Studio v0.4.0 — Local Automation Scheduler

**Status:** development branch. Release requires Node Linux/Windows, renderer build, real Electron E2E, Windows Setup/Portable and installed-worker gates green at the exact merge SHA.

## Purpose

Persist **local interval-based automation plans** for registered projects. Each plan targets the SHA-256 revision of a **saved** `.omniforge/flows/principal.json`. No workflow payload, credentials, API responses or raw project paths are stored in the schedule registry.

This is an application-local scheduler, **not** an operating-system service. Execution occurs only while the OmniForge Electron desktop is running, and uses the existing worker process, cancellation, bounded run timeout and metadata-only history.

## References and design choices

- Node-RED Inject: scheduling regular interval triggers as a different concern from the flow graph, implemented as an explicit control of a saved flow. https://nodered.org/docs/user-guide/nodes
- Electron powerMonitor: reacting to suspend/resume; resume never implies automatically replaying every missed event. https://www.electronjs.org/docs/latest/api/power-monitor
- Node.js timers: timer callbacks are not exact clock guarantees; app lifecycle and persistent records remain source of truth. https://nodejs.org/api/timers.html
- Electron security: context isolation, secure IPC allowlist, no exposure of Node.js filesystem or scheduling authority to the renderer. https://www.electronjs.org/docs/latest/tutorial/security/

## Storage contract

User-data directory:

`app.getPath('userData')/local-schedules/schedules.json`

No file is created or removed in the user's actual workspace by merely creating, activating, pausing or deleting a schedule. JSON schema version 1 uses an array of up to 50 records. Each record contains:

| Field | Role |
|---|---|
| `id` | Unique v4 UUID for the schedule |
| `projectId` | UUID from the already registered local project catalog |
| `flowRevision` | SHA-256 from the exact saved flow bytes |
| `label` | Human-readable title, maximum 72 chars |
| `intervalMinutes` | Integer 1–1440 |
| `enabled, state` | Explicit activation and idle/running/paused status |
| `nextRunAt` | ISO UTC clock boundary for next attempt while online |
| `lastStartedAt, lastFinishedAt` | Metadata only |
| `lastOutcome, lastMessage, lastHistoryId` | Bounded diagnostics and history identifier |
| `runs, misses, failures` | Bounded nonnegative counters |
| `runToken` | Internal UUID that ties a durable claim to exactly one completion |

The registry is validated on every read, written by atomic replacement, uses serialized mutations, rejects symlinks and limits maximum bytes (512 KB). An invalid registry **disables the scheduling subsystem** rather than erasing or resetting user data; the rest of the desktop can still start.

## User workflow

1. Open or register a workspace containing a saved valid flow.
2. Sidebar → **Agendamentos**. Enter a title and choose the frequency.
3. Click **Criar agendamento**. The new entry is **PAUSED**. No automatic execution has occurred.
4. Click **Ativar** and approve the native Electron warning. This enables scheduling at **now + interval**, never immediately.
5. Use **Executar agora** and explicitly approve the real-run dialog to validate the operation.
6. See the last result, number of runs, missed intervals, next clock time, and inspect the project's execution history.
7. **Pausar** stops future triggers; it does not retroactively undo an active file write. **Cancelar execução** aborts an active supervised process.
8. If the flow changes on disk, future attempts are blocked; pause the job, select **Aprovar revisão**, review the native dialog, and activate again. Editing the flow on disk is never silently accepted.
9. **Excluir** removes only scheduler metadata, not the workflow or output files.

## Execution state machine

```
CREATE → PAUSED
   └─ native consent → ENABLED / IDLE (nextRunAt = now + interval)
       ├─ polling (5 seconds) + due → DURABLE CLAIM / RUNNING
       │   ├─ resolved project + exact revision + validated graph
       │   │   └─ child worker → history + PASS/FAIL → IDLE
       │   └─ source changed/offline/grants invalid → BLOCKED / PAUSED
       ├─ manual run now (native consent) → same durable claim / worker
       └─ pause → PAUSED
```

- A common synchronous lock in the Electron main process prevents scheduled and manual workflows from running in parallel.
- A durable claim is stored before effects begin and has a unique `runToken`. Duplicate claim/completion attempts are rejected.
- After a crash with a persisted RUNNING state, startup recovery **pauses** the job and marks it INTERRUPTED. The user must inspect side effects and manually reactivate; no retry storm.
- When restarting after extended downtime or resuming Windows from suspension, missed due times are **coalesced** into a single missed-event record and the next due time is rescheduled in the future. They are **not re-executed** automatically.
- A flow taking longer than the interval coalesces elapsed ticks instead of immediately running again.
- After three consecutive failures, the task pauses itself. Invalid project, stale revision or missing permission also pauses the task on first blocked attempt.
- The UI receives only scheduler state events and bounded progress metadata, never JSON payloads or credentials.

## Authorization and side effects

At creation, the host reads the saved document, validates it and binds the revision. At enable time it validates the **same** exact revision again. At run time it reads, checks and validates once more before starting the worker.

**The automatic scheduler refuses `http.localJson` and `project.callLocalApi`**, because these currently rely on approval per execution and may have non-idempotent side effects. It allows already existing local data transforms, controlled JSON outputs, saved-CAD report/export and declarative extensions if their workspace-specific grants remain valid. Revoking a grant invalidates subsequent runs; the scheduler does not override it.

Dry-run and manual real execution remain available in the usual workflow editor. No change to the graph schema is required.

## Fault scenarios and security boundary

| Event | Behavior |
|---|---|
| App is closed / computer off | No execution. Existing plan remains stored; missed ticks coalesced at reopening |
| Windows suspend/resume | Timer stopped on suspend, missed ticks coalesced on resume |
| Native crash after worker started | On restart, plan interrupted and paused; outputs already committed may remain |
| User edits saved workflow | Revision mismatch: plan blocked until explicit reapproval |
| Project folder offline / catalog entry removed | Plan blocked and paused without writing to unrelated paths |
| Extension disabled or grant revoked | Validation fails; plan paused |
| Other manual/scheduled workflow active | Schedule defers; no parallel worker |
| Same output filename in one graph | Existing graph validation prevents collision, including extension outputs |
| HTTP/API node present | Schedule creation/activation rejected; no network access approved |
| Invalid file / symlink in scheduler storage | Fail closed. Do not automatically reset or delete metadata |
| Three consecutive failures | Plan automatically pauses |
| User removes a plan | Only schedule metadata removed; project/history/output unchanged |

## Limitations before enterprise/industrial production

This module improves local reliability but it does **not** guarantee exactly-once side effects, distributed locking, clustering, Windows Service/background operation without UI, reliable task execution during hibernation, cron/timezone/DST semantics, RBAC across multiple users, external audit server, rollback of file writes or transactions with remote systems. Installation is per user and binaries are unsigned; Windows SmartScreen may warn. PLC/OT control remains unsupported.

## Gates

- `node --test tests/local-scheduler.test.mjs` including fake-clock recovery and real worker write/history.
- `npm test` on Linux and Windows (all existing tests plus scheduler).
- `npm run build` production React/Vite.
- `npm run smoke:schedules` Electron native approval, real output, pause, restart, changed-revision rebind, nondestructive removal.
- Existing `smoke:electron`, `smoke:extensions`, `smoke:cad-import`.
- Windows `npm run dist:win`, real NSIS install/uninstall/Portable startup and installed ASAR worker, SHA-256 of binaries.
- Merge/publish only after all required jobs on the exact version commit have passed.
