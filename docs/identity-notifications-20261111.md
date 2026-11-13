# Account actions and notifications

Implemented additive Identity tables `AccountActionToken` and `Notification`.
No production migration or outbound message was performed during implementation.

## Configuration and activation

- `ACCOUNT_ACTION_ORIGIN`: exact frontend origin, HTTPS in production, no credentials/path/query/fragment. HTTP is accepted only for localhost/127.0.0.1.
- `NOTIFICATION_ENCRYPTION_KEY`: stable secret containing a base64 encoded 32-byte AES key. Store in the platform secret manager, independently of the database; preserve it during deployment/restarts. Rotation requires draining or invalidating existing encrypted queued actions first.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`: authorized transactional sender credentials. Adapter uses HTTPS `POST https://api.brevo.com/v3/smtp/email`, `api-key` header, sender/to/subject/textContent and acknowledgement messageId, per [Brevo API](https://developers.brevo.com/reference/send-transac-email).
- `NOTIFICATION_DISPATCH_ENABLED=true` opts into the built-in worker (10-second unref interval, no overlapping dispatch loops). It stays off by default and refuses to start without both Brevo credentials. Stop/start the process when changing this flag. An alternative private scheduler can call `POST /internal/notifications/dispatch` with the existing internal API key; do not expose internal routes through the public gateway. Dispatch claims at most20 messages, leases for60seconds and makes at most5 attempts with exponential delays. Expired process leases can be recovered; a crash after the fifth claim becomes FAILED when the lease expires. Missing transport returns503 and leaves QUEUED messages unchanged. SENT means the provider acknowledged acceptance, not delivery/read. Network uncertainty can cause redelivery; the stable provider IdempotencyKey is supplied, but exactly-once external delivery is not claimed.
- `REQUIRE_EMAIL_CONFIRMATION=true` is opt-in. Before enabling, configure the origin/encryption/Brevo sender and scheduler, test the actual sender/domain and callback journey, and communicate the change. New registrations are PENDING_VERIFICATION and queue confirmation. Existing ACTIVE accounts remain able to log in; they are not silently migrated or asserted verified. Pending accounts may request a new link at `/confirmar-email`. Provider acceptance and deliverability require separate production evidence.

## HTTP contracts

Public, auth-throttled POST endpoints:

- `/auth/password/forgot` `{email,callbackOrigin?}` and `/auth/email/request` `{email,callbackOrigin?}` return the same generic response for eligible/unknown/blocked/already-confirmed accounts. No raw token is returned.
- `/auth/password/reset` `{token,password}` and `/auth/email/confirm` `{token}` atomically consume hash-only expiring32-byte opaque credentials. Reset expires in30minutes; confirmation in24hours. Reissue is throttled per account to one per60seconds and invalidates older unconsumed tokens. Reset revokes every active session and serializes with login session creation, including a recheck against the password hash verified by login.

Mail links carry the raw credential in the URL fragment, never the query. Frontend reads it after hydration and clears the fragment. Database outbox stores only AES-256-GCM encrypted links; inbox and public APIs exclude encrypted payload and token hashes. Provider error bodies are never stored/logged. Final success/failure deletes encrypted payload. Password/token request fields use existing redaction.

Authenticated `GET /notifications` returns the current user's latest100 inbox messages and predefined account destinations. `PATCH /notifications/:id/read` scopes updates to that same user. Inbox existence does not claim successful email delivery.

Authenticated internal `POST /internal/notifications` accepts `{userId,template,idempotencyKey}`. Recipient email is resolved from authoritative Identity data, never caller-supplied. Templates are the20 concrete Portuguese messages in `notification-templates.ts`; token-bearing templates cannot be queued through this endpoint. Replays of a key return the existing message; a collision with another recipient/template is rejected. Event publishers must use a stable business-event key, e.g. `order-created:<order UUID>:<user UUID>`. Message text contains no caller-controlled content or URLs.

## Verification

Opt-in native PostgreSQL suite `recovery.postgres.spec.ts` refuses any host/database other than127.0.0.1:55434/potala_completion and cleans only its own generated users. It mocks HTTPS fetch, not the database. Covers anti-enumeration, origin rejection, hash/encryption/no public secret, concurrent consume, replay, expiry, wrong-purpose, pending confirmation, session revocation/stale-login rejection, owner-scoped inbox/read, enqueue idempotency/collision, competing dispatch leases, authoritative email resolution, missing transport and bounded failure. No live Brevo request is needed or authorized by these tests.

The extension is reversible by disabling the confirmation flag and stopping dispatch; retain additive tables for audit and queued-message recovery. Do not drop account/session data for rollback.
