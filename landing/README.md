# Strike Everywhere landing page

Standalone marketing site for the Strike Everywhere Chrome extension. The extension itself remains in the parent project. This app lives in `landing/` and has its own dependencies and build output.

## Stack

- Next.js 16 App Router, static export
- Tailwind CSS 4
- shadcn/ui components (`button`, `card`, `badge`, `separator`, `accordion`)
- Cult UI `text-animate`
- Local font files via `next/font`

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

`npm run build` writes the static site to `out/`. Preview it with any static file server, for example:

```bash
npx serve out
```

## Downloads

The install section links to two static archives in `public/downloads/`:

- `strike-everywhere-0.1.0-source.zip` — buildable source: `package.json`, `package-lock.json`, configs, `manifest.json`, `src/`, `assets/`, `demo/`, README, LICENSE. Extract it and run `npm install && npm run build`, then load `dist/` unpacked.
- `strike-everywhere-0.1.0-extension.zip` — the current `dist/` build. Extract it and load the extracted folder unpacked; no build step.

No public repository URL is published yet. The landing page labels the source archive as the canonical download rather than inventing a repository link. Regenerate both archives when the extension source or build changes.

## SEO

- Server-rendered content in the static export
- Per-page title, description, canonical, Open Graph, and Twitter metadata
- JSON-LD for `SoftwareApplication`, `WebSite`, and `FAQPage`
- `robots.txt` and `sitemap.xml`
- Semantic landmarks, one `h1`, descriptive image alt text
- `manifest.webmanifest` and brand icons

Set the production URL and mark the build as a release before deploying:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.example NEXT_PUBLIC_RELEASE=true npm run build:release
```

`build:release` runs `scripts/check-release-url.mjs` first. It refuses to build when `NEXT_PUBLIC_RELEASE=true` and `NEXT_PUBLIC_SITE_URL` is unset or still ends in `.example`, so the placeholder cannot pass into a deployment by accident. Local previews can keep using `npm run build`; they fall back to `https://strike-everywhere.example` (a clearly reserved placeholder).

Canonical URLs, Open Graph URLs, JSON-LD, robots, and the sitemap all use `NEXT_PUBLIC_SITE_URL`.

## Content sources

The landing page uses the extension README and verification captures. Product screenshots are copied into `public/shots/` from `docs/verification/` in the parent project. The sample article in the hero is labelled as a sample; the market card is a real capture dated 23 Oct 2026.

No analytics, telemetry, remote fonts, or third-party scripts are loaded by this site.

## Honest limits

- The Chrome Web Store listing is not published, so the install call to action goes to the source-build steps.
- The risk model is experimental and has not been validated against three real Strike positions.
- The simulator capture is labelled as synthetic demo data.
- This is an independent hackathon build for the Strike ecosystem, not an official Strike product.

## Verification

`scripts/verify-landing.mjs` runs a Playwright check against the static build. It uses an existing Playwright install. Set `PLAYWRIGHT_PATH` (a `file://` URL or package path) and `CHROMIUM_PATH` if the defaults on this machine do not apply. It records:
- desktop, mobile, and 320 px layout checks
- horizontal overflow
- broken images
- missing in-page anchors
- mobile navigation and FAQ behavior
- console and page errors
- screenshots and a JSON report in `docs/screenshots/`

Run it against a server on port 4000:

```bash
python -m http.server 4000 --directory out
node scripts/verify-landing.mjs
```
