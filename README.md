# Church TV Builder

A managed church TV intake and internal review application. Built with Astro 7, TypeScript, Supabase Postgres/Auth/Storage, and the Netlify server adapter.

Churches submit their information once. Allowlisted staff review materials, add notes, request missing information, and track status. **Milestone 1 does not compile TV binaries or publish apps.** Branding previews and build simulations are labelled. Store approval is never guaranteed.

## 1. Install

Install Node.js **22.22 or newer** (Node 22 LTS recommended) and Git. Open a terminal:

```sh
git clone https://github.com/irvingcollege/ChurchTVBuilderApp.git
cd ChurchTVBuilderApp
npm ci
```

Use the existing checkout when working in Codex cloud. Each cloud task is already isolated; do not create a separate Git worktree unless specifically requested.

The lockfile pins dependencies. `npm ci` does not rewrite it. On restrictive cloud machines, use `npm ci --cache /workspace/.npm-cache` and set `XDG_CONFIG_HOME=/workspace/.config` and `ASTRO_TELEMETRY_DISABLED=1` before Astro commands. Do not disable TLS or checksum verification.

## 2. Choose a Supabase database

### Local development (no real secrets)

Install Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Local configuration is in `supabase/config.toml`; the CLI 2.39.2 workflow is tested here. From the repository root:

```sh
supabase start -x realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npm run setup:local-env
```

The first command starts Postgres, Auth, Storage, REST, a gateway, and a local mail catcher; applies the migration; and loads the fictional seed. It prints **local-only** development keys—never use those on a public deployment. The helper captures local keys directly into ignored `.env` with restrictive permissions, without printing them or overwriting an existing file. If using a nonstandard CLI path: `SUPABASE_CLI=/path/to/supabase npm run setup:local-env`.

If the default public ECR registry is blocked but Docker Hub is allowed, use `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start` with the same exclusions. To stop: `supabase stop`. Docker services must be restarted in a new cloud task; running processes do not survive environment snapshots.

To recreate **only a disposable local database**, run `supabase db reset`. This destroys local database contents; do not use it to refresh an environment containing work you need. The seed is repeatable and does not create or authorize staff. `fixtures/sample-church.json` is fictional and its stream URL deliberately does not promise playback.

### Hosted Supabase

1. Create a new dedicated Supabase project. Do not reuse an existing production site’s database.
2. In the Supabase SQL editor, run the complete `supabase/migrations/202610200001_initial.sql` migration once. Alternatively, use your authenticated Supabase CLI to link this new project and apply migrations with `supabase db push`. Do not run the fictional seed in production.
3. Copy `.env.example` to `.env`. Enter the project URL, anon key, and server service-role key from project settings. These are **server variables**, never `PUBLIC_` variables. Keep `.env` out of Git.
4. Set `SITE_URL` to the exact web origin, initially `http://localhost:4321`. Set Supabase Auth’s Site URL to that same origin. Disable public sign-up in Auth settings; creating a normal account never grants staff access anyway.
5. Keep the `church-assets` bucket **private**. The migration supplies its size and MIME restrictions. Do not add public object-read or upload policies.

The app fails closed with a setup message if Supabase is not configured. The public landing page and intake UI can be developed without database credentials; successful submissions and staff actions require the database.

## 3. Bootstrap your first staff member

1. Create/invite the person through Supabase Dashboard → Authentication → Users. Use a confirmed email and set a strong password through the provider’s secure flow. Password reset and invitations are managed in Supabase, not a public staff sign-up page.
2. Copy that Auth user’s UUID, not their email.
3. Run this command from the repository root, replacing the example UUID:

```sh
npm run bootstrap:staff -- 11111111-1111-4111-8111-111111111111
```

The helper only allowlists an existing Auth identity and uses the server credentials in `.env`. Alternatively, run in the SQL editor:

```sql
insert into public.staff_users (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin');
```

4. Start the app and visit `/staff/login`. Use the allowlisted user’s email and password. Both `admin` and `reviewer` roles currently have review permissions; no browser UI can grant staff access.
5. To revoke access, delete that user’s `staff_users` row through your administrator workflow. Authorization is checked on every request, so an unexpired session does not preserve revoked access.

Staff sessions use an HTTP-only, SameSite=Strict cookie, Secure on HTTPS. Sessions expire rather than using a long-lived refresh token; sign in again after expiry. Enable your organization’s Supabase Auth password protections, rate limits, and MFA policies as appropriate.

## 4. Run and check

```sh
npm run dev
# Open the local Astro address printed in your terminal.
```

Visit `/` for the public site, `/start` for the four-step intake, and `/staff` for internal review. The intake does not save partial drafts. Optional images: PNG/JPEG, up to 2 MiB each, 16 megapixels, no animation. Server decoding re-encodes images without metadata. There is no browser playback of submitted URLs.

```sh
npm run check       # ESLint, Astro/TypeScript, 43 unit/Postgres integration tests, Netlify build
npx playwright install chromium
npm run test:e2e    # public intake, mobile layout, staff redirect, unauthorized API checks
npm run test:live   # opt-in real LOCAL Supabase end-to-end workflow; needs .env and services
```

For an already installed Chromium in cloud, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`. Browser tests start Astro if necessary. `test:live` refuses hosted Supabase: it creates disposable local Auth identities and fictional submissions, uploads a real PNG, verifies storage privacy, signs in, reviews notes/status, requests a simulated email, and runs a simulated build. It removes test identities from the allowlist and bans them afterward; it retains their audit history. Local test data remains for inspection.

Default `test:e2e` marks the live-stack test **skipped** unless `LOCAL_SUPABASE_E2E=1`. Unit/database tests use PGlite’s actual Postgres engine with simulated Supabase Auth roles/schema, exercise the production migration, and require no external services. They complement the live tests; they do not alone prove Supabase Auth/Storage integration.

`npm run build` emits a Netlify server function, not TV application packages. Use `npm run dev` locally; the adapter does not support a standalone Astro preview server. Source is under `src/`, migrations under `supabase/`, and fictional fixtures under `fixtures/`.

## 5. Deploy to Netlify

1. Push this repository to your intended GitHub branch and import it as a new Netlify site.
2. Build command: `npm run build`. Publish directory: `dist`. The checked-in `netlify.toml` selects Node 22 and the Astro Netlify adapter supplies server functions.
3. In Netlify environment settings, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, and `EMAIL_PROVIDER`. Make server secrets available to **functions at runtime** as well as build-time where needed. Never expose them as client variables or in source control. Use a separate Supabase project per development/production environment.
4. Set `SITE_URL` and Supabase Auth’s Site URL to the final HTTPS origin. A wrong origin intentionally causes POST requests to fail. Deploy previews should use separate data/credentials and their exact origin; do not point them at production by default.
5. Apply migrations to the new project and bootstrap staff as above. Ensure your Supabase custom SMTP/invitation setup is configured if you use invitations/password resets.
6. Deploy, then test intake with fictional content, private images, unauthorized reads, staff login, status history, notification mode, and dry-run jobs. Verify the bucket stays private. A passing local build does not establish a successful deployment.
7. Production abuse controls: configure Netlify edge/WAF rate limiting for `/api/intake` and `/api/login`, Supabase Auth limits, monitoring, retention, backups, and operational alerts. A persistent global intake budget of 100 attempts/hour is included; it limits upload costs but is not a per-client anti-abuse system. Consider a bot challenge before opening intake broadly.

No deployment is performed automatically. Native signing credentials belong in a dedicated worker vault, never Netlify’s church intake, ChurchConfig, or uploaded files.

## Email integration

Default `EMAIL_PROVIDER=development`: requests are recorded with state `simulated`; **no email is sent** and the dashboard says so. In production set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to a verified sender (with a monitored inbox for replies). The server calls `https://api.resend.com/emails` with a plain-text message. A provider ID is required for `sent`, meaning provider acceptance, not confirmed delivery. There is an 8-second timeout. Missing configuration or provider failures record `failed`; interrupted attempts remain `pending` for manual review. There is no background retry, delivery webhook, or inbound attachment portal yet. Avoid blindly resending an uncertain request. Requests do not automatically change the submission status.

See [Security and operations](docs/SECURITY.md), [Feature checklist](docs/FEATURES.md), and [Validation report](docs/VALIDATION.md).
