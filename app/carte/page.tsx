import type { Metadata } from 'next'
import { MenuCategories, MenuStatus } from '@/components/menu/MenuCategories'
import { Footer } from '@/components/sections/Footer'
import { Navbar } from '@/components/sections/Navbar'
import { getPublicMenu } from '@/lib/menu/queries'

export const metadata: Metadata = {
  title: 'La carte — Trattoria Costantina, Hénin-Beaumont',
  description: 'La carte de la Trattoria Costantina à Hénin-Beaumont : antipasti, pâtes et plats, pizzas, desserts et boissons.',
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
              <MenuCategories categories={categories} headingLevel="h2" />
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
