import type { Metadata } from 'next'
import { CarteMenu } from '@/components/menu/CarteMenu'
import { MenuStatus } from '@/components/menu/MenuCategories'
import { Footer } from '@/components/sections/Footer'
import { Navbar } from '@/components/sections/Navbar'
import { getPublicMenu } from '@/lib/menu/queries'
import { socialMetadata } from '@/lib/seo/metadata'

const title = 'La carte — Trattoria Costantina, Hénin-Beaumont'
const description =
  'La carte de la Trattoria Costantina à Hénin-Beaumont : antipasti, pasta, pizza napoletana, desserts, spritz, apéritifs, bières, vins, digestifs et boissons sans alcool.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/carte' },
  ...socialMetadata({ title, description, path: '/carte' }),
}

export default async function CartePage() {
  const menu = await getPublicMenu()
  const categories = menu.status === 'ok' ? menu.categories : []

  return (
    <>
      <Navbar />
      <main>
        <header className="page-banner">
          <div className="container">
            <p className="supertitle supertitle-light"><span className="line"></span>Trattoria Costantina<span className="line"></span></p>
            <h1>La Carte</h1>
          </div>
        </header>
        <section className="section-specialites section-carte-full">
          <div className="container">
            {categories.length > 0 ? (
              <CarteMenu categories={categories} />
            ) : (
              <MenuStatus unavailable={menu.status === 'unavailable'} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
