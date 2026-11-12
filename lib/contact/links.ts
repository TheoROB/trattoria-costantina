// Spam messages carry a link (phishing, SEO): the contact form refuses links in its free-text fields.
// Three shapes: an explicit scheme, "www.", or a bare domain on a common or spam-favoured TLD. The TLD list keeps
// ordinary French text out: "18h30", "12.50", "env.", "etc.", "6 pers." and a missing space after a full stop
// ("possible.De plus", "table.Ca") do not match, because digits, "de", "ca", "me", "es"... are not listed.
// An e-mail address (marie@exemple.fr) is not a link: the part after "@" is never matched.
const SCHEME = /\b(?:https?|ftp):\/\//i
const WWW = /(?<![\w.-])www\./i
const TLDS = [
  'com', 'net', 'org', 'info', 'biz', 'fr', 'online', 'site', 'website', 'shop', 'store', 'xyz', 'top', 'club', 'icu',
  'vip', 'live', 'life', 'link', 'click', 'pro', 'app', 'dev', 'io', 'co', 'ly', 'gl', 'gd', 'cc', 'tv', 'ws', 'ru',
  'su', 'cn', 'tk', 'ml', 'ga', 'cf', 'gq', 'uk', 'be', 'ch', 'nl', 'fun', 'space', 'tech', 'today', 'world', 'page',
  'blog', 'news', 'agency', 'digital', 'email', 'media', 'network', 'buzz', 'monster', 'cfd', 'sbs', 'rest', 'bond',
]
const BARE_DOMAIN = new RegExp(`(?<![@\\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS.join('|')})(?![a-z0-9-])`, 'i')

export function containsLink(text: string) {
  return SCHEME.test(text) || WWW.test(text) || BARE_DOMAIN.test(text)
}
