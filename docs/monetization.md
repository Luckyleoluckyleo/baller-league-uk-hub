# Monetization setup — AdSense + GA4

AdSense publisher ID: **`ca-pub-7873503560434517`** (UK, Individual).
Site is connected in AdSense and was submitted for review. Ads do **not** serve until
the site shows **Ready** and the steps below are done.

## 1. GA4 Measurement ID

1. Go to **analytics.google.com** → create a property for `ballerleagueukhub.com`.
2. **Admin → Data streams → Web** → add `https://ballerleagueukhub.com`.
3. Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`).
4. Paste it into `src/layouts/Base.astro`:

   ```ts
   const GA_ID = 'G-XXXXXXXXXX'; // ← replace with your real ID
   ```

   Analytics only loads once `GA_ID` is a real `G-…` value (the placeholder keeps it off).

## 2. Ad units (after AdSense approval)

1. In AdSense: **Ads → By ad unit → New ad unit → Display** → create two
   **responsive** units: one named **Top**, one **In-content**.
2. Copy each unit's **`data-ad-slot`** number.
3. Paste them into `src/data/ad-slots.ts` and flip the switch:

   ```ts
   export const ADS = {
     enabled: true,          // ← enable once slots are filled
     slots: { top: '1234567890', inContent: '0987654321' },
   };
   ```

   While `enabled` is `false` (or a slot is empty) **no ad renders anywhere**, so this
   is safe to deploy before approval.

## 3. Consent (required for UK/EEA)

- AdSense → **Privacy & messaging** → enable a **certified CMP** (Google's own is free).
- Without this, UK ads will not serve. `src/pages/privacy.astro` already describes the
  AdSense/cookie use; it does not replace the CMP.

## 4. Where the ads appear

`src/components/AdSlot.astro` is placed on: `/` (homepage), `/fixtures`, `/teams`,
`/records`, `/table`, and news articles (skipped on `noindex` thin pages).
Max one unit per page, reserved height to protect Core Web Vitals.

## 5. Guardrails

- Do not hand-edit `src/data/*.json` or generated `src/content/news/*` — the weekly
  pipeline overwrites them.
- `npm run build` must stay green before pushing.
- Commit/push outside cron windows (Mon 23:30, Tue 08:00, Tue–Thu 10:00/17:00 UTC).

## 6. Expectations

At ~1,000 pageviews/month, AdSense ≈ **£2–£6/month**; the £60 payout threshold means a
payout is a while off. Real near-term upside is **ticket affiliate + sponsorship**
(see `/media-kit`), with SEO traffic growth as the long-term multiplier.
