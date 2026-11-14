# Interactive CLI — implementation slice 5

The CLI provides a local terminal client over the shared m1cro runtime. It is distributed as the `m1cro` binary from `@m1cro/cli`.

## Entry points and configuration
- `m1cro [options] [prompt...]` starts an interactive session; a prompt argument runs one turn and exits.
- `--workspace`, `--session`, `--model`, `--base-url` configure the current invocation.
- `OPENAI_API_KEY`, `M1CRO_MODEL`, and `OPENAI_BASE_URL` override local configuration.
- Optional configuration is stored in `~/.m1cro/config.json`; the CLI creates this file with mode `0600` in a directory with mode `0700`.
- JSONL sessions are stored beneath `~/.m1cro/sessions`; session IDs are constrained to a safe character set before file resolution.

## Turn lifecycle
1. A session ID is generated or resumed via `--session`.
2. Prior message records are read back into the model conversation; event records remain a local audit trail.
3. The runtime sends provider-neutral messages/tool schemas to the OpenAI-compatible adapter.
4. Read tools run under the default policy. Write-risk tools emit an approval request.
5. The CLI asks for a typed confirmation of the exact tool and input. Only a literal `y` returns an approval decision attributed to the user; all other input rejects.
6. Runtime events and messages are appended to the JSONL journal.

## Available built-ins
- `read_file`, `list_files`, `search_files` — read risk.
- `write_file` — write risk and explicit approval.
- All paths are relative to the configured workspace root.

## Deliberate limits
- Provider support in the CLI is currently the OpenAI-compatible adapter; additional providers are additive.
- The CLI is interactive; non-TTY use is limited to a one-shot prompt and rejects pending approval because no person can answer.
- API key setup is best done via `OPENAI_API_KEY`; first-run interactive entry is terminal-visible and saved locally for convenience.
- No shell/process execution, remote sandbox, web workspace, account system or hosted inference is provided by this slice.
