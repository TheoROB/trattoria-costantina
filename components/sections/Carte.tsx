// Placeholder menu from the validated mockup; replaced by MySQL data in Lot C.
const foodPhotos = [
  { src: '/images/food-1.png', alt: 'Burrata des Pouilles' },
  { src: '/images/food-2.png', alt: 'Orecchiette alle Cime di Rapa' },
  { src: '/images/food-3.png', alt: 'Panna Cotta alla Pugliese' },
  { src: '/images/food-4.png', alt: 'Burrata aux tomates' },
  { src: '/images/food-5.png', alt: 'Pasta pugliese' },
  { src: '/images/food-6.png', alt: 'Dessert maison' },
]

const categories = [
  {
    title: 'Antipasti & Primi',
    items: [
      { name: 'Burrata des Pouilles', desc: "Burrata crémeuse, tomates cerises, huile d'olive des Pouilles", price: '10€' },
      { name: 'Carpaccio di Manzo', desc: 'Bœuf finement tranché, câpres, parmesan et roquette', price: '10€' },
      { name: 'Orecchiette alle Cime di Rapa', desc: 'Pâtes fraîches maison, broccolini, anchois, chapelure dorée', price: '10€' },
      { name: 'Focaccia Barese', desc: 'Focaccia pugliese aux olives, romarin, sel de mer', price: '6€' },
    ],
  },
  {
    title: 'Les Plats de Nonna',
    items: [
      { name: 'Truffe di Riso', desc: 'Croquettes de riz au fromage et truffe noire, sauce tomate maison', price: '13€' },
      { name: 'Agnello al Forno', desc: 'Agneau rôti aux herbes, pommes de terre, romarin, tomates confites', price: '22€' },
      { name: 'Polpette alla Griglia', desc: 'Boulettes grillées de veau, sauce tomate fraîche, basilic', price: '25€' },
    ],
  },
  {
    title: 'Dolci & Desserts',
    items: [
      { name: 'Panna Cotta alla Pugliese', desc: 'Panna cotta vanille, coulis de figues, amandes grillées', price: '9€' },
      { name: 'Pasticciotto Leccese', desc: 'Chausson sablé à la crème de citron, spécialité du Salento', price: '8€' },
      { name: 'Tartufo al Cioccolato', desc: 'Glace artisanale au chocolat noir enrobée de cacao amer', price: '10€' },
    ],
  },
]

export function Carte() {
  return (
    <section id="specialites" className="section-specialites">
      <div className="container">
        <div className="section-header">
          <p className="supertitle"><span className="line"></span>La Carte<span className="line"></span></p>
          <h2>Nos Spécialités</h2>
          <p className="section-subtitle">Des recettes authentiques des Pouilles, préparées avec des ingrédients frais et de saison</p>
        </div>

        <div className="food-grid">
          {foodPhotos.map((photo) => (
            <div className="food-item" key={photo.src}><img src={photo.src} alt={photo.alt} /></div>
          ))}
        </div>

        <div className="menu-grid">
          {categories.map((category) => (
            <div className="menu-category" key={category.title}>
              <h3>{category.title}</h3>
              <ul className="menu-items">
                {category.items.map((item) => (
                  <li key={item.name}>
                    <div className="menu-item-info">
                      <span className="menu-name">{item.name}</span>
                      <span className="menu-desc">{item.desc}</span>
                    </div>
                    <span className="menu-price">{item.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="section-cta">
          <a href="#reservation" className="btn btn-primary">Voir la carte complète</a>
        </div>
      </div>
    </section>
  )
}
