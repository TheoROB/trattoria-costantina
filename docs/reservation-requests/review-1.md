# Revue indépendante 1 (Codex) sur `8708ffc`

**Verdict : CHANGES_REQUIRED.**

## Findings

1. **Comptage avant chargement de l'iframe.** `ReservationCta.tsx` envoyait l'événement dès `showModal()`, avant même que l'iframe soit montée ou chargée. `InlineReservationTracker.tsx` ne mesurait que la géométrie, sans attendre `load`. Une ouverture fermée avant chargement était donc comptée.
2. **Occultation ignorée.** Un module intégré recouvert par le menu mobile ou par un modal pouvait être compté, car `IntersectionObserver` ne voit pas ce qui le recouvre.

## Corrections

- `lib/reservation-requests/opening.ts` regroupe les machines d'état pures, testées unitairement :
  - `createModalOpening` : une ouverture reste en attente jusqu'au `load` de l'iframe ; elle est abandonnée si le modal se ferme avant ; une seule fois par ouverture ; les réouvertures après chargement comptent immédiatement.
  - `createInlineDwell` : il faut à la fois `load`, une visibilité suffisante, un onglet visible et aucune occultation pendant 1 s d'affilée. Le minuteur est suspendu sous un overlay, puis repart de zéro sans doublon.
  - `isOccluded` : `<dialog open>`, ou bouton du menu mobile affiché avec `aria-expanded="true"`.
- `DishWidget` accepte `onLoad`. Le module intégré écoute `load`, avec le repli Resource Timing décrit plus bas.
- Limites documentées honnêtement dans `implementation.md` (« Ce que `load` prouve ») : `load` cross-origin ne prouve ni le succès métier, ni un contenu correct. Chromium déclenche `load` sur sa page d'erreur réseau, ce que le test client constate et qui reste compté. Aucun signal parent fiable n'existe, aucune API ni `postMessage` de confirmation. Le comportement lié aux confirmations n'a pas changé (toujours à l'arrêt).
- Tests :
  - 14 tests unitaires ;
  - 10 tests navigateur sur le vrai client local, avec `playwright.client.config.ts` (sans base, stubs déclarés) : chargement différé, fermeture avant chargement, réouverture, re-rendu, échec réseau, module intégré, menu mobile, modal par-dessus le module intégré.

## Encore bloqué (rien d'inventé)

- `npm run test:integration` et les specs e2e/admin adossées à la base : il n'y a toujours pas de base de test sur cette machine.
- QA navigateur manuelle sur appareils réels : à exécuter après cette revue.
