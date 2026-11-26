// Google AdSense configuration.
//
// FILL THESE IN once the site is approved in AdSense (Ads → By ad unit →
// create a responsive "Display" unit and copy its data-ad-slot value).
// Until `enabled` is true AND the matching slot ID is filled, no ad is rendered
// anywhere, so it is safe to deploy before approval.
export const ADSENSE_CLIENT = 'ca-pub-7873503560434517';

export const ADS = {
  enabled: false,
  slots: {
    // Above-the-fold / page-top unit.
    top: '',
    // Mid-content or below-the-table unit.
    inContent: '',
  },
};
