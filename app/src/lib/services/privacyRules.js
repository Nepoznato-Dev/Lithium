/**
 * Default privacy rules for PrivacyService.
 *
 * These are the built-in tracking parameters, cosmetic CSS selectors, and
 * shield defaults that ship with Lithium OS.  Users can extend (but not
 * remove) these from the Privacy Dashboard.
 */

/** Tracking query-string parameters to strip from URLs. */
export const DEFAULT_TRACKING_PARAMS = [
  // Google
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_name', 'utm_cid', 'utm_reader', 'utm_viz_id', 'utm_pubreferrer',
  'utm_swu', 'utm_social-type',
  // Facebook / Meta
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  'gclid', 'gclsrc',
  // Microsoft / Bing
  'msclkid',
  // HubSpot
  '_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp',
  // Mailchimp
  'mc_cid', 'mc_eid',
  // Adobe / Omniture
  's_cid', 's_kwcid',
  // Hubspot
  '_openstat',
  // Yandex
  'yclid', '_openstat',
  // DoubleClick
  'gclid', 'dclid',
  // Wicked Reports
  'wickedsource', 'wickedid',
  // Cross-domain
  '_gl', '_ga', '_ke',
  // Otrack
  'oly_enc_id', 'oly_anon_id',
  // Vero
  'vero_id', 'vero_conv',
  // Others
  'ref', 'referrer', 'tracking_id', 'aff_id', 'sub_id',
];

/** CSS selectors for cosmetic filtering — hide common ad remnants, cookie
 *  banners, newsletter popups, and consent dialogs. */
export const DEFAULT_COSMETIC_RULES = [
  // Cookie consent banners
  '#cookie-consent',
  '#cookie-banner',
  '#cookie-notice',
  '#cookieNotice',
  '#cookieConsent',
  '.cookie-consent',
  '.cookie-banner',
  '.cookie-notice',
  '.cookie-overlay',
  '.cookie-wall',
  '#onetrust-consent-sdk',
  '.optanon-wrapper',
  '#CybotCookiebotDialog',
  '.cc-banner',
  '.cc-window',
  '#gdpr-consent',

  // Newsletter / subscription popups
  '.newsletter-popup',
  '.newsletter-modal',
  '.subscribe-popup',
  '.subscribe-modal',
  '.email-subscription',
  '#newsletter-signup',

  // Common ad containers
  '.ad-container',
  '.ad-wrapper',
  '.adsbygoogle',
  '#google_ads_iframe_',
  '.dfp-ad',
  '.ad-slot',
  '.ad-unit',
  '.advertisement',
  '[id^="div-gpt-ad"]',

  // Social sharing overlays
  '.social-share-popup',
  '.share-modal',
];

/** Default shield level applied to domains that haven't been configured. */
export const DEFAULT_SHIELD_LEVEL = 'standard';
