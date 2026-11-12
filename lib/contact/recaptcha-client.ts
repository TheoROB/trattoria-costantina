// Browser side of reCAPTCHA Enterprise (server side: lib/contact/recaptcha.ts). The site key is public and embedded
// by `next build`: changing it needs a rebuild.
export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || null

export const recaptchaScriptUrl = (siteKey: string) =>
  `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`

type GrecaptchaEnterprise = {
  ready: (callback: () => void) => void
  execute: (siteKey: string, options: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: { enterprise?: GrecaptchaEnterprise }
  }
}

const TOKEN_TIMEOUT_MS = 10_000
const POLL_MS = 100

// Asks for a fresh token. Called at submit time only: tokens expire after two minutes and are single use. Resolves to
// '' when enterprise.js is blocked, failed or too slow: the server then refuses the message with a "call us" text.
export async function getRecaptchaToken(siteKey: string, action: string, timeoutMs = TOKEN_TIMEOUT_MS): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string>((resolve) => (timer = setTimeout(() => resolve(''), timeoutMs)))
  const token = (async () => {
    // The script loads lazily (next/script lazyOnload): a very quick visitor may submit before it is there.
    while (!window.grecaptcha?.enterprise) {
      if (Date.now() >= deadline) return ''
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    const enterprise = window.grecaptcha.enterprise
    await new Promise<void>((resolve) => enterprise.ready(resolve))
    return await enterprise.execute(siteKey, { action })
  })().catch(() => '')
  try {
    return await Promise.race([token, timeout])
  } finally {
    clearTimeout(timer)
  }
}
