import type { Metadata } from 'next'
import { site } from '@/lib/site'

// Hero photo (terrace), an existing variant from scripts/optimize-images.mjs.
export const OG_IMAGE = {
  url: '/images/hero/1280.webp',
  width: 1280,
  height: 720,
  alt: 'Terrasse de la Trattoria Costantina : longue table en bois sous une arche et une treille de vigne',
}

// Open Graph and Twitter card for a page. Next replaces (does not merge) these objects in child
// segments, so each page with its own title passes it here.
export function socialMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: site.name,
      title,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}
