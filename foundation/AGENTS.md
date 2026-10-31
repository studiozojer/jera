# Jera Exact + Snapback foundation

This subtree is the authorized Exact rewrite. The root Expo-specific API and navigation instructions apply to the old app, not here. Read README.md. Pin Exact via ../../tooling/exact2 relative to app/ and Snapback through package.json/bun.lock. Use Bun 1.4.2. Do not modify SDK sources to work around an application defect.

Keep multiple armillaries, module membership, immutable source artifacts and attributed derived nodes distinct. A captured idea is not itself a commitment to build software. Agents use the same authenticated queries/mutations as the app; no privileged service token belongs in the client.

Run backend integration tests against an isolated real Snapback store and Exact browser tests. Do not substitute mock responses for integration evidence. Native builds require EAS and explicit build approval; do not run local native build/simulator commands or Exact's full prove matrix. No production deployment or ATproto publication is implied by foundation work.
