# Merit Portal

The internal staff portal for Merit's Rx workflow — physician review + pharmacy fulfillment, plus webhook glue back to Shopify. Patients live in Shopify (not here); the patient experience is the existing `/account` pages with light Liquid customization.

## What's in here

- **Next.js 15** (App Router) + TypeScript + React 19
- **Prisma 6** over Postgres for the data model
- **NextAuth v5** (Auth.js) — magic-link email auth via Postmark
- **Tailwind** for styling (matches Merit brand: Inter Tight, cobalt, cream)
- Two role-gated areas: `/physician/*` and `/pharmacy/*`
- API routes for Shopify webhooks and intake mutations
- S3 for PHI file storage (ID photos, lab PDFs, prescription PDFs)

## Architecture recap

```
                Shopify (patient side, no PHI)
                       │
                       │ webhook on payment + fulfillment
                       ↓
              Merit Portal (this app on Render)
              ─────────────────────────────────
              Postgres  ←  intake records, audit log
              S3        ←  PHI files (encrypted, BAA)
              Postmark  ←  staff magic-link auth + emails
                       ↑
                       │ /physician/*   /pharmacy/*
                staff browsers (allow-listed emails only)
```

Patient experience = Shopify `/account` + a Liquid block we add to show Rx expiration & refill button. No app to install for patients.

## Local setup

```bash
cd portal
npm install
cp .env.example .env       # then fill in values
npx prisma db push          # create tables in your local Postgres
npm run dev                 # http://localhost:3000
```

Local Postgres: easiest is Docker — `docker run --name merit-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16`, then `DATABASE_URL="postgresql://postgres:dev@localhost:5432/postgres"`.

## Production deploy on Render

### 1. Render setup (one-time, ~15 min)

1. Sign in at render.com, create a new **Web Service**
2. Connect to your GitHub repo (after we push it there)
3. Settings:
   - Runtime: **Node**
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npm start`
   - Plan: **Starter ($7/mo)** for build phase. Upgrade to **Pro + HIPAA** before going live with real patients.
4. Create a **Postgres** database in Render (same dashboard). Plan: Starter ($7/mo).
5. Copy the Postgres internal connection string into the Web Service's environment variables as `DATABASE_URL`.

### 2. Environment variables

In the Render Service → Environment, set everything from `.env.example`. The two trickiest:

- `AUTH_SECRET`: generate locally with `openssl rand -base64 32`, paste in.
- `POSTMARK_API_KEY`: from your Postmark server (postmarkapp.com → server → API tokens). Use a server dedicated to portal auth/notifications.

### 3. Custom domain

In Render → Service → Settings → Custom Domains: add `portal.meritsciences.com`. Add the CNAME record Render shows you in your DNS provider (likely Shopify DNS since that's where meritsciences.com lives). Wait ~5 min for cert provisioning.

### 4. First deploy

Push the repo to GitHub. Render auto-deploys on push to `main`.

### 5. Seed the first staff user

The portal has no public sign-up. You add staff manually via Prisma Studio:

```bash
# locally, with DATABASE_URL pointed at the Render DB:
npx prisma studio
# → User table → Add record → email, role: PHYSICIAN/PHARMACY/OPS, active: true
```

Once added, they go to `https://portal.meritsciences.com/signin`, enter their email, click the magic link in their inbox, they're in.

## HIPAA migration (Phase 5)

When real-patient traffic is imminent:

1. Upgrade Render Web Service to **Pro + HIPAA** ($250+/mo) — request via support
2. Upgrade Postgres to **Pro** (encryption at rest, point-in-time recovery)
3. Sign BAAs: Render, Postmark, AWS (for S3)
4. Enable Render audit log retention (90+ days)
5. Configure S3 bucket: server-side encryption (SSE-S3), versioning, lifecycle (auto-delete intake files after 7yr per HIPAA retention rules)
6. Add WAF rate-limiting + IP allowlist on `/pharmacy/*` (if pharmacy works from known IPs)
7. Flip `PORTAL_ENV` env var from `dev` → `prod`

The codebase is the same. The infrastructure tier changes.

## What's NOT in this MVP

These are deliberate cuts to ship faster. We can add them in subsequent phases:

- No SMS notifications (Twilio) — email only at first
- No 2FA on physician login — magic link is the auth (low-volume staff, defensible)
- No real-time messaging between patient ↔ physician — async only
- No pharmacy inventory tracking — orders go out one at a time
- No lab-order integration with Quest/Labcorp — manual today

## Project structure

```
portal/
├── app/                  Next.js App Router
│   ├── page.tsx          Landing / redirect to /signin
│   ├── signin/           Auth pages
│   ├── physician/        Physician portal (queue, intake view, decisions)
│   ├── pharmacy/         Pharmacy portal (order queue, tracking)
│   └── api/
│       ├── auth/         NextAuth handler
│       ├── intake/       Intake mutations (status changes, messages)
│       └── shopify-webhook/  Shopify → portal sync
├── lib/
│   ├── auth.ts           NextAuth config
│   ├── db.ts             Prisma client singleton
│   └── shopify.ts        Shopify Admin API helpers (to be added)
├── prisma/
│   └── schema.prisma     Data model (Users, Intakes, Pharmacy orders, audit)
├── public/               Static assets
└── README.md             You are here
```

## Build phasing checklist

- [x] **Phase 0 — Foundation**: project structure, schema, auth, deploy docs (this commit)
- [ ] **Phase 1 — Physician portal**: queue, intake view, approve/labs/reject actions
- [ ] **Phase 2 — Pharmacy portal**: order queue, tracking entry
- [ ] **Phase 3 — Shopify webhook glue**: receive order events, push status updates back
- [ ] **Phase 4 — Patient-side Liquid customization**: Rx expiration block + refill button on `/account`
- [ ] **Phase 5 — HIPAA migration**: Render Pro tier, BAAs, encryption review
