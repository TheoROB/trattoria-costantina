# Revue indépendante Codex — cycle 2, SHA 65000c9

VERDICT: CHANGES_REQUIRED

BLOCKING

- **P1 — `components/reservation/InlineReservationTracker.tsx:42`, `lib/reservation-requests/opening.ts:96` : Resource Timing ne prouve pas le chargement de cette iframe.** Scénario : charger le modal sur `/carte`, le fermer, puis naviguer via le lien interne vers `/#reservation`. L’entrée de l’ancienne iframe reste dans `performance`, avec exactement le même `src`. Le nouveau tracker positionne donc `loaded=true` alors que son iframe peut encore charger, puis compte après une seconde visible. Le finding 1 reste partiellement ouvert. Le test unitaire vérifie seulement URL/type ; aucun test navigateur ne couvre cette navigation. En outre, lorsque TAO autorise les timings, la fin du fetch peut précéder `load` : l’équivalence générale annoncée est incorrecte. [Règles HTML](https://html.spec.whatwg.org/multipage/browsing-the-web.html#pending-resource-timing-start-time), [explication Chromium](https://groups.google.com/a/chromium.org/g/blink-dev/c/b0-4JXb3kuo).

- **P2 — `components/reservation/ReservationCta.tsx:77`, `lib/reservation-requests/opening.ts:27` : modal compté dans un onglet masqué.** Ouvrir avec chargement différé, masquer l’onglet, puis laisser arriver `load` appelle immédiatement `report()`. Aucun contrôle de `document.visibilityState`, contrairement au module intégré. Le critère d’affichage au visiteur n’est donc pas respecté. Il manque un test vérifiant attente en arrière-plan, comptage au retour visible et abandon si fermeture préalable.

NON_BLOCKING

- **Finding 2 corrigé pour les overlays prévus** : observation des attributs `open`/`aria-expanded`, vérification du bouton mobile affiché et réévaluation au redimensionnement cohérentes avec les composants/CSS. Le délai repart de zéro ; découvrir un module déjà compté ne recompte pas.
- **Déduplication/réouverture** : état conservé entre re-rendus, `load` répétés ignorés après comptage, fermeture avant chargement annulée et réouvertures comptées dans les séquences couvertes.
- **Preuves relues, non réexécutées** : logs concordants pour 308 unitaires, lint/types/build et 10 tests Chromium. Les stubs iframe/ingestion sont explicites ; ils ne prouvent aucune persistance. SQL, intégration et admin authentifié restent sans preuve d’exécution faute de DB locale.
- **Limite technique distincte** : le test Chromium mesure bien `load` sur erreur réseau. Le parent ne peut pas vérifier le contenu DISH cross-origin ; aucune confirmation de réservation n’est comptée.
- `diff --check` : anomalies uniquement dans `evidence/logs/build.log:12,13,14,43` et `unit.log:14`. Nettoyage documentaire par Jeff ; aucun défaut whitespace hors logs.
- AGENTS.md lu, HEAD confirmé `65000c9`. Aucun fichier modifié, aucun sous-agent, accès secrets/DB/live/API DISH, commit ou push.

QUESTIONS

- Le contrat accepte-t-il une ouverture d’iframe ayant émis `load`, y compris sur page d’erreur ? S’il exige l’affichage effectif du module DISH fonctionnel, une décision humaine reste nécessaire : les preuves actuelles ne permettent pas de garantir ce critère.
