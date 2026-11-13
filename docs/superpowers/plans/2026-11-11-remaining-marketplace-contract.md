# Remaining Marketplace Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Implement and verify remaining marketplace functionality of the signed Anexo I while preserving prior work and accurately separating production/external acceptance requirements.

**Architecture:** Existing gateway + Identity/Sellers/Catalog/Orders and Next frontend. Owner services remain authoritative; authenticated internal APIs instead of cross-schema reads. Additive migrations; isolated native PostgreSQL at127.0.0.1:55434/potala_completion for all proofs.

**Tech Stack:** NestJS/Prisma6/PostgreSQL17, Next16/React19, native Node APIs and installed dependencies.

**Spec:** `docs/avaliacao-final-anexo-20261110.md`, `docs/closure-results-20261111.md`, original PDF Anexo I pp.2–9. Institutional/therapists/blog remain outside this implementation as instructed previously. Source PDF text in workspace `analise-potala/anexo-reconferido-20261110.txt`.

## Global Constraints

- Preserve feature branch and preexisting deploy/render/VALIDATION.md; baseline backend9c1e172/frontende8e9d75. No main changes or unsafe partial production deployment.
- User declined new provider connections. Do not repeat requests or claim production/MFA/secrets verified without access. Existing free plans do not prove capacity/SLA.
- Legal copy, commercial rates, shipping provider and payment gateway are not invented approvals. Build configurable publication/approval workflows and document missing source decisions. No subscription, credential purchase, actual charge or external mail during tests.
- Notifications must distinguish queued/sent/failed, avoid public token exposure and account enumeration, secure reset/confirmation tokens, one-time consumption, expiry and session revocation. Brevo is named in PDF; configure adapter only from official docs and fail closed without credentials.
- Shipping totals are authoritative server-side and persisted per seller; no client supplied price. Free shipping/pickup only when explicitly configured. Fiscal file storage does not constitute issuing a fiscal document.
- Partner documents and fiscal files are private, scoped, size/type validated, audited and never served by untrusted external URL proxy. Retain rollback/data integrity.
- Continue approved own analytics with external tags disabled. Preserve consent withdrawal serialization and server-confirmed business events.
- Complete real tests, not just scaffolding; final report must state remaining external/production evidence honestly.

## Tasks

- [ ] **Identity and notifications:** password reset, email confirmation, hash-only expiring tokens, anti-enumeration, replay/concurrency protection and session invalidation; frontend flows. Notification outbox + in-app inbox and Brevo adapter, up to20 real templates, controlled internal enqueue/user recipients, retries/idempotency and no false sent state. Connect essential domain events via internal contract after implementation.
- [ ] **Shipping and fiscal:** seller-configured delivery/pickup with safe quote/snapshot, server totals and coupon interaction, preserved cent splits/idempotency; checkout choices and seller settings. One configurable approved carrier integration boundary with missing configuration explicitly unavailable. Private fiscal/receipt attachments linked to seller orders, seller upload/customer/admin download/audit and UI.
- [ ] **Partner documents and policies:** up to10 configurable document types, review/request correction/resubmit/status history/private downloads; versioned draft/published legal policies and authoritative immutable acceptances, safe public pages and partner/customer flow. Do not publish generated legal copy as approved.
- [ ] **Catalog completeness:** up to10 typed configurable attributes per item type, actual seller/admin controls and public filters with validation/queries; preserve active product/card/image behavior and no new fake seed data in production.
- [ ] **Operational reliability:** inspect readiness/rate-limit behavior from real prior load finding, make health semantics robust without bypassing user protections; repeat only relevant proof and preserve failed 1000/IP scenario. Prepare complete launch/account/cost/backup/monitor runbook and accessible operational evidence.
- [ ] **Integration/review:** register modules/gateway/env mappings, generate/migrate only isolatedDB, add full-flow tests for new journeys/IDOR/permissions/tokens/freight/fiscal, review independently, build/test browser and update evidence ledger.
- [ ] **Delivery:** update contract matrix T01–T14 and added cases; preserve rollback. Commit/push feature branches after passing checks. Publication, production backup/MFA/rotation, actual gateway and training session remain unclaimed unless independently verified.

## Ownership and coordination

Retomada de 13/11/2026: implementação e provas desta rodada registradas em `docs/remaining-contract-results-20261113.md`; execução/retorno em `docs/launch-runbook-20261113.md`. Os itens acima abrangem aceite externo ainda pendente e não são marcados integralmente concluídos por testes locais. Gateway financeiro excluído pelo usuário.

Identity agent owns identity schema/modules + auth UI + notification frontend. Shipping agent owns Orders schema/modules + Sellers delivery settings only and checkout/fiscal UI. Partner/legal agent owns Sellers document schema/module and Catalog legal schema/module + onboarding/legal UI. Root owns Catalog attributes, gateway/AppModule/runtime environment registration, root evidence/integration. Use apply_patch on shared schemas and coordinate before client generation. Do not install dependencies or mutate production.
