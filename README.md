# Hook'd v2 (Next.js + Tailwind)

A polished starter for the Hook'd fishing social app. Mobile-first, dark mode, feed & profile layouts, ready for PWA + Capacitor later.

## Quickstart
```bash
npm install
npm run dev
```
Open http://localhost:3000

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
