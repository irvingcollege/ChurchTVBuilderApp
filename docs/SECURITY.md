# Security and operations

## Trust boundaries

- Churches have no accounts, draft tokens, listing endpoint, or public read access. Intake is a single submission. The server assigns random UUID tenant IDs and UUID-derived slugs. A reference ID is not an access credential.
- The browser calls same-origin server endpoints. No service-role key reaches client bundles. The server uses a verified Supabase Auth JWT for staff reads and mutations; the `staff_users` allowlist is checked in the API and in RLS/security-definer RPCs. Both staff roles intentionally share review access across churches; tenants are independent records, not church user accounts.
- Anonymous/public roles cannot call intake’s service-only RPC directly or read application tables. Staff have read-only table grants and explicitly authorized RPCs for mutations. They cannot alter history or grant themselves staff access. `is_staff` has a fixed search path and avoids recursive RLS.
- The server service role bypasses RLS and must remain secret. It is used for public submission creation, bounded private uploads/signing, and delivery receipts, only after validation or staff checks as appropriate. Never use an admin client to replace staff authentication. Administrators with database-owner privileges can change policies/triggers; append-only protection is an application authorization boundary, not protection against the database owner.
- Auth uses provider password login. Cookies are HTTP-only, Strict SameSite and Secure on HTTPS; every POST checks Origin against `SITE_URL`. GET endpoints do not change workflow state; signed asset access is audited. Server responses disable caching. CSP blocks frames, arbitrary scripts, embedded submitted URLs, and outbound browser connections. Protected material is proxied from a short-lived signed URL to avoid browser connections to unknown hosts. The separate signed-URL endpoint accepts only an asset UUID, performs a staff/RLS lookup and expires access after 60 seconds. Do not copy these bearer links into logs or messages.

## Intake and storage

JSON uses a shared strict version-1 Zod schema, with length caps, consent/rights assertions, valid IANA timezone, hex colors, and fixed platforms. Links require HTTPS, no credentials, public-looking hostnames and standard ports. A syntax check cannot determine whether a hostname resolves to a private address. **The server deliberately does not fetch submitted links**, so DNS rebinding is not an execution path in this milestone.

Multipart bodies are read with a 4 MiB + 64 KiB cap even without a Content-Length header. Each file is capped at 2 MiB; only PNG/JPEG with matching signatures is accepted. Sharp decodes with a 16-megapixel bound and re-encodes without metadata; animated/malformed/oversized normalized images are rejected. Filenames are ignored in favor of `<random-tenant-uuid>/<random-asset-uuid>.(png|jpg)`. Supabase also enforces private bucket/type/size restrictions. User-provided SVG/HTML cannot enter the image bucket through intake.

Uploads precede the atomic database RPC. A failed RPC triggers storage cleanup; cleanup failures log the opaque tenant ID for reconciliation. A crash between upload and transaction can leave orphaned storage objects. Operators should reconcile old storage prefixes against `assets` before deletion, and retain a recovery window. No application table is partially committed if intake fails. Do not rerun or delete an entire bucket to clear an individual failure.

A database-backed global 100 attempts/hour budget runs before parsing and uploading. It intentionally limits total load and may block legitimate intake during abuse. It is not per-IP authentication or a bot challenge. Add platform edge/WAF rules and monitoring before broad production use. The honeypot is supplemental only. Netlify payload/time limits also apply.

## Stream preflight

The authenticated endpoint parses URLs, rejects unsafe schemes, credentials, private/reserved IP literals (including normalized numeric and IPv4-mapped forms), local hostnames and custom ports. It returns `not_fetched` and unknown network/codec/device support. It does not inspect manifests, DNS, CORS headers, child playlists, segments, redirects, TLS, or playback. Its CORS advice is guidance, not a test result.

A future fetching adapter must resolve **all** A/AAAA records, reject every non-public destination, pin the validated address for the connection while verifying the original TLS hostname, disable or revalidate redirects, enforce DNS/connect/read deadlines and manifest/body limits, and avoid following child URLs automatically. A DNS check followed by an ordinary fetch is vulnerable to rebinding. Do not add browser-side embeds or “test playback” links to untrusted submitted URLs.

## Workflow honesty and audit

Allowed status transitions are enforced in PostgreSQL under a row lock with an expected-current-status check. Each change adds an immutable event and audit entry with Auth actor/time. Notes and material requests are append-only through authorized RPCs. An email record distinguishes pending, simulated, sent (provider acceptance) and failed; never interpret simulation as delivery.

Build jobs retain the exact config row ID, platform and a simulation flag. Dry runs go from queued to failed with an explicit explanation and no artifact path. Database constraints prevent simulated jobs from becoming ready. No worker is implemented and there is no download endpoint. QA/publishing statuses require an actual non-simulated ready artifact; published also requires a publishing record with a store URL. The future trusted worker must verify artifact existence, checksums, target and tenant before writing readiness. Database artifact metadata alone does not prove hardware QA. Signing/store credentials must live in a separate worker vault.

Future adapters: Roku BrightScript/SceneGraph, Android TV Kotlin/Media3/Gradle AAB, Samsung Tizen WGT, LG webOS IPK. They require real toolchains, isolated workers and platform/device QA. Publisher accounts remain church-owned with delegated staff access. Template registry, transcoding, remotely updated content feeds and signing are future work.

## Operations before public launch

Use a dedicated project and private bucket, configure a verified email sender/inbox, staff access policy, edge rate limits, Auth safeguards, alerting, backup/restore drills, and data retention/deletion procedures. Monitor pending notifications and orphan uploads. Keep contact information, private materials, signed links and server keys out of logs. Test revocation by deleting a staff allowlist row. Do not seed real projects with development users or sample churches. Follow dependency advisories and patch with regression checks. Never disable TLS, signatures, or checksums to resolve an install problem.

This repository has no billing/payment flow. Pricing/invoicing can be added separately; intake consent is not a payment agreement.
