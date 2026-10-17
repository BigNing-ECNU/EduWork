---
name: ssh
description: Maintain a user-authorized remote Linux server through the system OpenSSH client: inspect logs, run commands and edit configuration.
---

# SSH server maintenance

Use the existing shell tool and the system OpenSSH client for an explicitly requested remote maintenance task. This keeps local workspace paths local; it does not mount a remote workspace or move Studio, Office or browser tools to the server.

## Connect

1. Use the host/SSH config alias, account and task supplied by the user. Ask for missing connection details; never guess a production target. Check `ssh -V` and, if useful, `ssh -G <alias>` without connecting first. Do not disclose private keys or credentials in output.
2. Reuse an existing SSH config and key agent. Start with a harmless identity probe, e.g. `ssh -T -o BatchMode=yes -o ConnectTimeout=10 <alias> 'hostname; id; pwd'`. Do not disable host-key checking or silently accept a changed key. If authentication or host trust needs setup, explain it so the user can complete it through their normal SSH client.
3. Permissions still follow the application's current policy and the user's authorized task. Local workspace write access does not itself authorize changing an unrelated server. Do not silently escalate privileges or use another credential after a denial.

## Operate

- Run remote commands explicitly through `ssh`; do not pass a remote path to a local file-edit, Office, preview or browser tool. Label remote and local paths clearly.
- Each SSH command starts a new remote process. Use an explicit remote working directory on every call, such as `cd /srv/example && ...`; do not assume a previous `cd` persists.
- Quote for both the local shell and the remote shell. Treat path/host input as data. Prefer passing a reviewed script over stdin (`ssh ... 'sh -s'`) for multi-line work; avoid nested string-built commands containing secrets or user-controlled substitutions.
- Inspect before changing. For configuration edits, retain a dated backup when appropriate, validate the service's configuration before applying, and check the resulting service state. Follow the user's task for restart/deployment permission; do not add unrelated changes.
- Use bounded log reads and command output. After a disconnect or timeout, first inspect whether the command already ran. Do not automatically repeat a deployment, restart or other non-idempotent operation.
- File transfers use the same explicit target and permission boundaries. Store any downloaded diagnostics in the authorized local workspace and avoid collecting unrelated private data.

The separate upstream DSH SSH backend is experimental and POSIX-only. Do not claim that it is enabled by this skill, that Windows supports that backend, or that remote desktop/file-preview integration is available.
