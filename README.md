# SimCare CACREP Alignment Mapper

A pre-sales discovery tool for counseling program directors. Paste or upload a syllabus → in ~10 seconds get a per-objective mapping to CACREP 2024 standards and the named SimCare avatars that teach them.

Built as a portfolio proof-of-concept inspired by SimCare AI (YC S24). Independent project, not affiliated with SimCare AI.

## Stack

- **Next.js 14 (App Router)** — single deployable unit, server + client in one repo
- **Tailwind CSS** — design tokens defined in `tailwind.config.js`, Inter + Instrument Serif via Google Fonts
- **Groq (GPT-OSS-120B)** — free-tier reasoning model, called server-side so the API key never ships to the browser
- **Input** — paste text only. PDF/DOCX upload is intentionally deferred to a later version; raw PDF text often blows the model's free-tier per-minute token budget with headers, footers, and page noise.

## Local development

```bash
npm install
cp .env.example .env.local        # then paste your Groq key(s)
npm run dev                       # http://localhost:3000
```

Get a Groq key at [console.groq.com](https://console.groq.com) — email / Google / GitHub login, no credit card, ~30 seconds. Free tier per key: 30 requests/min, 8,000 tokens/min, 14,400 requests/day.

### Multi-key rotation

`GROQ_API_KEYS` accepts a **comma-separated list** of keys. The server tries them in order, advancing to the next key on a 429 (rate limit) and retrying the same request. The starting index is remembered in memory so consecutive requests don't re-burn an exhausted key. Example:

```
GROQ_API_KEYS=gsk_first,gsk_second,gsk_third
```

A single-key fallback `GROQ_API_KEY=gsk_...` is honored if `GROQ_API_KEYS` is unset.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com), **Add new → Project**, import the repo.
3. **Environment Variables** → add `GROQ_API_KEYS` (comma-separated list of `gsk_...` keys, no spaces) and mark it for Production + Preview + Development.
4. **Deploy**. Vercel detects Next.js automatically; no build settings to touch.

## Project layout

```
app/
  layout.jsx                  root layout (fonts, body)
  page.jsx                    main client UI
  globals.css                 design tokens, gradient mesh, hover-tilt
  api/map/route.js            POST → Groq, returns parsed JSON
  api/preflight/route.js      POST → detect format, normalize convertible inputs
lib/
  cacrep-standards.js         33 Section-3 standards (verbatim from cacrep.org)
  simcare-courses.js          8 courses + ~50 avatars (catalog.simcare.ai, June 2026)
  sample-syllabus.js          Used by "Use sample syllabus" button
  system-prompt.js            Mapping system prompt
  preflight-prompt.js         Normalization system prompt
```

The data files in `lib/` are imported only by `app/api/*/route.js`, so they live on the server and are not shipped to the browser bundle.

## API contracts

**`POST /api/preflight`** — `{ syllabusText }` → `{ action: 'map' }` | `{ action: 'review', objectives, hint }` | `{ action: 'reject', message }`.
Heuristic format detector. If the input already has objective shape, returns `map` immediately. If it's a weekly schedule / topic list / brief description, normalizes via Groq and returns inferred objectives for user review. Non-course content gets a friendly rejection.

**`POST /api/map`** — `{ syllabusText }` → `{ results, usage, _meta }`.
The actual mapping. Sends a trimmed payload (no `keywords`, no internal `why_useful` from the catalog) to Groq, parses the JSON array response, looks up canonical fields (area, course_url, etc.) server-side from the source data, returns enriched results.

## Data sources

- **CACREP standards** — official [2024 CACREP Standards PDF](https://cacrep.org/wp-content/uploads/2025/09/2024-CACREP-Standards-PDF.pdf), Section 3 only.
- **SimCare courses + avatars** — scraped from [catalog.simcare.ai](https://catalog.simcare.ai) in June 2026. Avatar names, ages, presenting problems, and SimCare-assigned CACREP codes are transcribed from the catalog pages.
- **Legacy codes** — taken from SimCare's own catalog pages (mostly 2016-style); null where no equivalent was found.

## Notes

- The mapping is LLM-generated and intended for pre-sales discovery. Review before using in any accreditation document.
- The prompt payload is trimmed (no whitespace, no internal `keywords` field) to stay under Groq's free-tier 8k TPM cap on GPT-OSS-120B.
- The 3D hover-tilt on result cards is pure CSS (`perspective` + `transform`) and respects `prefers-reduced-motion`.
