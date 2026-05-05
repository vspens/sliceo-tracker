# Sliceo Tracker

Tracking and reporting app built with Next.js for Sliceo campaign links, clicks, deliveries, and leads.

## Tech Stack

- Next.js 16 + React 19
- TypeScript
- Supabase
- Vitest + ESLint

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env.local
```

If you do not have `.env.example` yet, create `.env.local` manually with the required keys listed below.

3. Start the app:

```bash
npm run dev
```

App runs at `http://localhost:3000`.

## Required Environment Variables

These are used in the current codebase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LEAD_PUSH_WEBHOOK_URL`
- `LEAD_PUSH_WEBHOOK_SECRET`
- `FALLBACK_REDIRECT_URL` (optional, fallback exists in code)
- `NEXT_PUBLIC_APP_URL` (optional for local; defaults to `http://localhost:3000`)

`*.env*` files are ignored by Git (`.gitignore`), so secrets will not be pushed unless force-added.

## Useful Commands

- `npm run dev` - start local dev server
- `npm run build` - build for production
- `npm run start` - run production build locally
- `npm run lint` - run lint checks
- `npm run test` - run tests

## Deploy (Vercel)

1. Push committed code to GitHub.
2. Import the repository in Vercel.
3. Add the environment variables in Vercel Project Settings -> Environment Variables.
4. Deploy.

Vercel builds from committed files in GitHub. Ignored files such as `.env*`, `.next/`, and `node_modules/` are expected to stay out of Git.
