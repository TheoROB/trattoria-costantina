'use client'
import { useRef, useState } from 'react'
import { Picture, type ImageKey } from '@/components/Picture'

export type GalleryPhoto = {
  image: ImageKey
  alt: string
  /** Large thumbnails take a full grid row; the others share the row below. */
  large?: boolean
  /** Extra class on the thumbnail, e.g. to set its object-position (inline styles are blocked by the CSP). */
  className?: string
}

// Mirrors .trouver-photos: large thumbnails are half of the left column, small ones a fifth.
const LARGE_SIZES = '(max-width: 640px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 38px), (max-width: 1200px) calc(25vw - 34px), 266px'
const SMALL_SIZES = '(max-width: 640px) calc(20vw - 22px), (max-width: 900px) calc(20vw - 18px), (max-width: 1200px) calc(10vw - 16px), 100px'
// The lightbox image fits in 92vw x 85vh; sources are 3:4 portraits.
const LIGHTBOX_SIZES = '(min-aspect-ratio: 3/4) 64vh, 92vw'

export function TrouverGallery({ photos }: { photos: GalleryPhoto[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [current, setCurrent] = useState<number | null>(null)

  const open = (index: number) => {
    setCurrent(index)
    dialog.current?.showModal()
  }
  const step = (delta: number) => setCurrent((i) => (i === null ? i : (i + delta + photos.length) % photos.length))
  const photo = current === null ? null : photos[current]

  return (
    <>
      <ul className="trouver-photos">
        {photos.map((p, index) => (
          <li key={p.image} className={p.large ? 'is-large' : undefined}>
            <button type="button" className="gallery-thumb" onClick={() => open(index)} aria-label={`Agrandir la photo : ${p.alt}`}>
              <Picture image={p.image} alt={p.alt} sizes={p.large ? LARGE_SIZES : SMALL_SIZES} className={p.className} />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="gallery-dialog"
        aria-label="Photos de la Trattoria Costantina"
        onClose={() => setCurrent(null)}
        // A click on the backdrop lands on the dialog element itself.
        onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') step(-1)
          if (event.key === 'ArrowRight') step(1)
        }}
      >
        {photo && current !== null && (
          <figure className="gallery-figure">
            <Picture key={photo.image} image={photo.image} alt={photo.alt} sizes={LIGHTBOX_SIZES} loading="eager" />
            <figcaption>
              {photo.alt}
              <span className="gallery-count">{current + 1} / {photos.length}</span>
            </figcaption>
          </figure>
        )}
        <button type="button" className="gallery-nav gallery-prev" onClick={() => step(-1)} aria-label="Photo précédente">‹</button>
        <button type="button" className="gallery-nav gallery-next" onClick={() => step(1)} aria-label="Photo suivante">›</button>
        <button type="button" className="gallery-close" onClick={() => dialog.current?.close()} aria-label="Fermer">×</button>
      </dialog>
    </>
  )
}
