# Marketplace error repairs

Scope: marketplace frontend, gateway and Identity/Sellers/Catalog/Orders only. Institutional site excluded. Payment provider selection, approved legal content, real operational rates and production infrastructure acceptance remain outside this code-fix phase.

Preserve existing uncommitted evaluation and date-aware validation scripts. Do not use the unrelated Supabase project. The connected account does not expose the Potala database. Do not retry the previously blocked local PostgreSQL startup or claim new PostgreSQL proofs without running them.

1. Reproduce missing-schema/error-log handling with focused tests. Preserve conflict/not-found semantics; translate known missing database structure and pool failures into safe 503 responses and controlled operational codes. Remove raw production exception stacks/queries from logs across the four service copies.
2. Fix public activity list empty/error confusion, stale requests and retry. Verify error versus empty versus successful page in local browser fixtures. Do not pretend a missing migration is fixed by returning an empty list.
3. Fix banner readability using scoped color tokens; replace unsupported blanket freight promotion with neutral delivery messaging. Verify computed styles and responsive public layout locally.
4. Generate original migrations separated into four schemas, transactional SQL files, source hashes, read-only preflight and post-check instructions. Preserve migration history; no auto-baseline or destructive reset. Explicitly identify three migrations previously reported as applied.
5. Run focused regressions, relevant suites/builds and package integrity verification. Record code fixes versus pending production SQL/deploy; retain rollback through prior commit and additive tables. No production data mutation without authenticated access.
