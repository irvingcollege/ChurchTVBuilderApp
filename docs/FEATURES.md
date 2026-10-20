# Milestone 1 feature checklist

## Implemented

- [x] Responsive Astro/TypeScript landing site with managed-service explanation and four platform targets; no store approval promise.
- [x] Four-step, single-submit intake with church/contact information, web/social links, description, services/timezone, HLS/archive URLs, app name/colors, optional logo/banner, rights and consent.
- [x] Shared strict client/server validation; no insecure anonymous draft saving.
- [x] Opaque tenant IDs/slugs, atomic Postgres intake, normalized versioned ChurchConfig snapshots.
- [x] Private image storage, bounded payloads, signature and decode checks, safe random names, metadata removal, 60-second staff-authorized signed reads.
- [x] Supabase Auth staff login and database allowlist/RLS; revocable authorization on every request.
- [x] Staff list, local search (latest 200), church detail, staff notes, controlled status changes, immutable status history and audit log.
- [x] Missing-material requests with persisted receipts, explicit simulated-email fallback and Resend adapter.
- [x] Clearly labelled branding/TV home-screen illustration. This preview uses name, colors and schedule; it is not a playable TV application.
- [x] Protected preflight endpoint with safe URL parsing, no submitted-URL fetching/embedding, CORS guidance and explicit unknown codec/device/network support.
- [x] Build Jobs model with queued/running/failed/ready states and immutable config reference; protected simulation UI producing failed/no-artifact results.
- [x] SQL migrations, private bucket, RLS, fictional seed/fixture, server env template, staff bootstrap helper, local/deployment docs, security notes, unit/Postgres integration and browser tests, lint/typecheck/build.

## Deliberately future / unavailable

- [ ] Native Roku/Android TV/Tizen/webOS builds, downloads, template registry and isolated build workers.
- [ ] Signing, church-owned store account delegation, actual submission/publication and store approval.
- [ ] Real hardware QA, remote-control navigation tests, codec/device playback checks and legal/store-policy review.
- [ ] Network manifest/segment fetching (preflight currently checks syntax only), archive feed ingestion and content feed service.
- [ ] Asset transcoding into platform-specific dimensions and generated store listing materials.
- [ ] Church authentication, saved drafts, church self-service portal and missing-material resubmission portal. Staff request manual email replies for now.
- [ ] Staff invitation/password-reset UI (use Supabase’s administrator workflow).
- [ ] Background email retry/delivery webhooks, inbound email handling, production sender verification.
- [ ] Pricing, invoicing, payments and subscriptions.
- [ ] Long-term retention automation, orphan cleanup worker and full-text/paginated large-volume submissions search.

Actual production publishing and email delivery require external configuration and verification. See the validation report for what was executed in this environment.
