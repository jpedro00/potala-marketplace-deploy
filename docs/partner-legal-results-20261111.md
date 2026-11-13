# Partner documents and versioned policies — implementation evidence

Implemented in the existing feature workspace without production changes or dependency installation.

## Behavior

- Sellers owns configurable active document requirements (at most ten), private PDF/JPEG/PNG uploads (5 MiB decoded, bounded JSON parser, canonical base64 and file signatures), immutable uploaded versions, owner-only tenant downloads and download audit.
- Administrators use seller-scoped read/approval grants to review a specific store, approve/request correction/reject the latest version, and inspect review/status history. Superseded versions cannot be reviewed. Platform scope controls document-type configuration.
- Submission requires configured mandatory documents and the authenticated owner's acceptance of the currently published partner agreement, checked through Catalog's authenticated internal HTTP API. No cross-schema SQL. Missing policy/service configuration fails closed. Existing SellerStatus values remain unchanged; derived reviewStatus exposes PENDING_DOCUMENTS/UNDER_REVIEW/APPROVED/BLOCKED.
- Activation checks the latest required documents are approved and that a submission exists when requirements are configured. Existing legacy flows without configured requirements retain compatibility.
- Catalog owns five policy keys: TERMS, PRIVACY, COOKIES, PURCHASE_RETURNS, PARTNER_ADHESION. Admin creates a new immutable version as DRAFT, then explicitly publishes reviewed copy or revokes publication. A partial unique index and per-key transaction locks enforce one published version. Old acceptances retain policy version/content hash, authenticated identity and timestamp.
- Acceptance rejects draft/revoked/noncurrent versions and ignores caller-supplied identity. A database trigger prevents changing/deleting acceptance proof. Repeated acceptance of the same version is idempotent.
- Public legal pages display configured published plain text safely; absent policy explicitly says publication is pending. No generated legal text is seeded or approved for production.
- Seller review/approval events queue local notification jobs atomically for authoritative OWNER memberships. Optional dispatcher uses a recoverable lease, exponential retry and stable idempotency keys when enqueueing in Identity. ENQUEUED means Identity durably accepted the notification, never that an email was sent.

## Routes and UI

- Seller: `/seller/onboarding/documents`, `POST .../submit`, `GET .../:id/download`; UI `/loja/documentos`, available to pending owners.
- Admin: `/admin/partner-document-types` (POST/PATCH), `/admin/partner-documents/:sellerId` and document review/download; UI `/admin/documentos-parceiros`.
- Public: `/legal/policies/:key`; authenticated `/legal/acceptances`; admin `/admin/legal/policies` plus publication/revocation; internal `/internal/legal/requirements/:key/:userId` guarded by Catalog internal key.
- UI `/termos`, `/privacidade`, `/cookies`, `/compra-troca-cancelamento`, `/adesao-parceiro`; editor `/admin/documentos-legais`. Footer and sidebars link these workflows.
- Internal owner recipient lookup `/internal/sellers/:sellerId/notification-recipients` returns UUIDs only.

## Verification

- Sellers full Jest suite: 14 suites, 124 tests passing.
- Legal focused suites: 2 suites, 3 tests passing, including session identity anti-spoofing.
- Sellers/Catalog TypeScript build passed; frontend `tsc --noEmit` passed.
- `scripts/verify-partner-legal.cjs` passed against native isolated PostgreSQL at `127.0.0.1:55434/potala_completion`. Covers draft/revocation/version rejection, immutable database proof, eight concurrent accepts, owner authorization and download IDOR, correction/reupload/stale review, download audit, authoritative HTTP acceptance gating on submission, maximum ten document types, durable retry/backoff and concurrent notification claims. Notification HTTP stub is local; no external email was sent.
- Catalog's earlier full suite reported an unrelated changed resolveVariants snapshot (new categoryId/itemType); root/shipping owns that update. Legal tests remained green.

## Configuration and remaining external acceptance

Sellers `CATALOG_SERVICE_URL`/`CATALOG_SERVICE_API_KEY` are an optional validated pair. Missing configuration blocks partner submission. `SELLER_NOTIFICATION_DISPATCH_ENABLED=false` by default leaves durable jobs pending; enable only with Identity configured. Identity separately owns external mail dispatch state/configuration.

Approved legal copy, document requirement names, production service keys/deployment, external email delivery and actual business acceptance remain organization-owned decisions. Test legal text exists only in the isolated test database. Registration/customer flow integration is coordinated with Identity/root rather than concurrently editing their forms.
