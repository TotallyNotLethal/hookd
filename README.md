# Hook'd v2 (Next.js + Tailwind)

A polished starter for the Hook'd fishing social app. Mobile-first, dark mode, feed & profile layouts, ready for PWA + Capacitor later.

## Quickstart
```bash
npm install
npm run dev
```
Open http://localhost:3000

### Marine overlays configuration

The fishing map now layers optional bathymetry, contour labels, and seamark tiles on top of the default
OpenStreetMap basemap. To enable the MapTiler-powered bathymetry and contour layers, create a free MapTiler
account, generate an API key, and expose it to the client by setting `NEXT_PUBLIC_MAPTILER_KEY` in your environment
(e.g., `.env.local`). MapTiler's community plan currently includes up to 100,000 map tile requests per month—keep an
eye on usage in production to avoid throttling.

OpenSeaMap seamarks render without an API key, but please respect their usage guidelines and cache headers when
deploying a high-traffic application.

## Pages
- `/` landing
- `/feed` sample feed (static demo data)
- `/profile` profile page
- `/login` auth UI

## Notes
- Uses Tailwind only (no external UI lib needed), with components styled to feel like shadcn.
- Replace images in `/public/sample` with your own.
- Add auth + DB when ready (Supabase/Firebase are good fits).

## Firestore indexes
Challenge catches are queried with an `array-contains` filter on `hashtags` plus a `createdAt` sort in both `lib/firestore.ts` helpers `subscribeToChallengeCatches` and `getChallengeCatches`. Deploy the provided composite index before running the app against the production database:

```bash
firebase deploy --only firestore:indexes --project hookd-b7ae6
```

Once the deployment finishes, both helpers load without Firestore prompting for an additional index.
