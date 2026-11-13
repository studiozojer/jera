# Bounded operator reply runner

Run with Bun 1.4.2 in the independently owned operator home. This initial runner targets one explicitly chosen @mention; it does not poll feeds or automatically publish. `reply.mjs` uses the same authenticated Jera client and immutable `post.v1` definition as the app. No service credential is used.

A private JSON configuration names `origin`, `did`, `handle`, `target`, `session` (the existing verified OAuth session file), `state`, `graph`, `sources` (explicit graph-relative Markdown paths), `model` (`opencode/deepseek-v4.1-flash`), and optional `opencode` executable path. Graph and identity inputs are bounded; model tools are denied. OpenCode's provider credential is provisioned separately in that operator's private home. Content is sent to the selected model provider; no source credentials enter its prompt.

```
bun scripts/operator/run.ts draft /private/operator-config.json
bun scripts/operator/run.ts status /private/operator-config.json
# Only after reviewing state/draft.json, approve those exact envelope bytes:
bun scripts/operator/run.ts publish /private/operator-config.json <reviewHash>
```

SQLite atomically claims a target before generation, retaining the draft, stable publication intent, selected source hashes, model, prompt hash and review hash. Repeated draft triggers report existing state. A failed or interrupted generation needs manual inspection and explicit recovery; it does not automatically spend again. Running/publishing rows left by process death remain held. `uncertain` publication can only retry the same reviewed envelope. The trusted Jera gateway rechecks audience/reply access and deduplicates the intent. A successful result is independently reread and attributed to the configured DID.

Reads include only the requested post and up to 15 ancestors, not every sibling reply or unrelated feed content. Explicit textual `@handle` or `@shortname` matching is provisional; Jera does not yet supply structured mention facets. Self-authored posts, missing/deleted sources, changed context, overlong chains and unavailable authorization fail closed. Source access is checked again after inference and before publication. A saved draft may outlive remote access revocation in the operator's private state; it cannot then be published by this runner.

This is a bounded response vessel using Tycho's identity files and selected graph notes, not the full interactive armillary boot or a graph-writing agent. The source repository remains authoritative; this runner never writes graph nodes. Session expiry requires renewed authorization for now; no password is stored in the guest and no privileged session minting is allowed. Source state, OpenCode sessions, private drafts and SQLite backups require a deliberate retention/backup policy before continuous operation. No timer or autonomous publishing is enabled by installing the runner.
