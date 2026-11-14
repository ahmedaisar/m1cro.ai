# Built-in workspace tools — implementation slice 4

The runtime can be given a `Workspace` rooted at a host-selected directory. The implementation registers four filesystem tools: `read_file`, `write_file`, `list_files` and `search_files`.

## Trust and permission boundaries
- Paths are workspace-relative; absolute paths and traversal outside the root are rejected.
- Existing path components are inspected with `lstat`; symlinks are not traversed.
- Reads and writes have byte limits (2 MiB defaults).
- Writes use a same-directory temporary file, restrictive mode `0600`, fsync, then rename.
- Search skips `.git`, `node_modules` and `dist`, skips symlinks, caps results and line length, and ignores binary-looking files.
- Read/list/search are classified `read`; write is classified `write` and therefore reaches the runtime approval controller.
- Tools are opt-in: the host explicitly calls `registerFilesystemTools`; no tools are globally installed.

## Not included in this slice
- Shell/process execution: intentionally deferred until a sandbox-backed executor is available. The host must not register a raw `child_process` tool as a substitute.
- Atomic writes are best-effort within the local filesystem; cross-device moves are avoided by creating the temporary file in the destination directory.
- Path-component rechecks reduce symlink races but do not provide kernel-level `openat2`/directory-handle confinement on every supported platform. Treat the workspace as a local trust boundary, not a defence against a hostile same-user process racing the filesystem.
