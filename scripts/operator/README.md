# Operator runner moved to Hearth

[Hearth](https://github.com/studiozojer/hearth) owns the operator VM, private-home provisioning and bounded Jera reply runner. Its `runners/jera` adapter uses Jera's authenticated client and immutable record contracts. Jera remains the application and API, not the owner of an operator's runtime or memory.

The first runner originated in Jera PR #13 (`96f435c`) and retains its tests and provenance in Hearth. Its durable job keys, private session file, graph and publication intents survive the extraction. Existing deployed Jera runner releases remain available for rollback; new source development belongs in Hearth.

Jera's `scripts/client.mjs`, `contracts/` and trusted publication gateway remain canonical here. Hearth currently consumes a byte-identical, provenance-checked snapshot. Changes to audience permissions, OAuth or record semantics belong here, not in a forked runner contract. No service token is available to an operator.
