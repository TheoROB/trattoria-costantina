import { Carte } from '@/components/sections/Carte'
import { Famille } from '@/components/sections/Famille'
import { Footer } from '@/components/sections/Footer'
import { Hero } from '@/components/sections/Hero'
import { Histoire } from '@/components/sections/Histoire'
import { Navbar } from '@/components/sections/Navbar'
import { Reservation } from '@/components/sections/Reservation'
import { Trouver } from '@/components/sections/Trouver'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Histoire />
      <Carte />
      <Reservation />
      <Famille />
      <Trouver />
      <Footer />
    </>
  )
}
