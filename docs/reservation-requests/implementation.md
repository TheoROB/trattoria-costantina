# Demandes de réservation : implémentation

Finalisation du WIP `61939ce` (branche `TheoROB/feat-reservation-requests`), le 31 octobre 2026.
Rien n'est déployé : la mise en ligne se fait à la main, par zip (voir `AGENTS.md`).

## Ce qui est compté

Une **demande de réservation** est une ouverture effective du module DISH (iframe) à l'écran d'un visiteur :

| Point d'entrée | Déclencheur | Code |
| --- | --- | --- |
| Bouton flottant « Réserver » (toutes les pages publiques, ordinateur et mobile) | `showModal()` réussi **puis** `load` de l'iframe pendant que ce modal est ouvert (immédiat aux réouvertures, l'iframe restant montée et chargée) | `components/reservation/ReservationCta.tsx`, `lib/reservation-requests/opening.ts` |
| Module intégré de l'accueil (`#reservation`), atteint par tous les liens « Réserver » (navbar, menu mobile, hero, famille, contact, footer) ou en défilant | iframe chargée (`load`) **et** au moins la moitié de l'iframe (ou la moitié de l'écran si elle est plus haute) visible 1 s d'affilée, onglet visible, ni menu mobile ouvert ni modal par-dessus | `components/reservation/InlineReservationTracker.tsx`, `lib/reservation-requests/opening.ts` |

- **Jamais avant `load`** (corrigé après la revue 1, voir `review-1.md`) : une ouverture fermée, ou un module intégré quitté, avant la fin du chargement de l'iframe n'est jamais comptée, même si `load` arrive ensuite. Les `load` suivants (navigation interne à DISH) ne recomptent pas la même ouverture.
- **Pas de doublon** : le modal ignore un dialogue déjà ouvert ; sa machine d'état (`createModalOpening`) est créée une fois par composant, donc un re-rendu ne compte ni n'annule rien. L'état du module intégré (`createInlineDwell`) vit dans un seul effet (`[]`) : un re-rendu n'y touche pas, une mise à jour ne relance ni ne double le minuteur, et le démontage nettoie observers, écouteurs et minuteur. Aucun identifiant n'est utilisé pour dédupliquer.
- **Occultation** : le minuteur du module intégré est suspendu tant qu'un `<dialog open>` existe ou que le bouton du menu mobile est affiché avec `aria-expanded="true"` (état React existant de la navbar, lu dans le DOM via `MutationObserver`, sans donnée personnelle, sans toucher à l'auth). À la fermeture, il repart de zéro (1 s pleine) ; recouvrir puis découvrir un module déjà compté ne recompte pas.
- **Chargement avant hydratation** : si l'iframe intégrée a fini de charger avant que React n'attache l'écouteur, l'entrée Resource Timing `initiatorType: 'iframe'` de son URL en tient lieu. Si le navigateur ne l'expose pas (tampon plein, navigateur non conforme), l'ouverture reste en attente et n'est pas comptée : sous-comptage possible, jamais de comptage anticipé.
- **Réouverture volontaire = nouvelle demande** : fermer puis rouvrir le modal compte à nouveau. Le module intégré compte à nouveau après avoir entièrement quitté l'écran puis être revenu. Un clic sur un lien « Réserver » alors que le module intégré est déjà à l'écran et déjà compté ne compte pas : ce n'est pas une ouverture.
- Ce n'est ni un clic, ni une réservation (celles-ci restent dans DISH), ni un visiteur.

### Ce que `load` prouve, et ce qu'il ne prouve pas

- L'iframe DISH est cross-origin : le parent ne lit ni son contenu, ni son statut HTTP, ni son titre, et DISH n'envoie aucun `postMessage` documenté (voir `evidence/dish-audit.md`). Il n'existe donc **aucun signal fiable de réussite côté parent**.
- `load` dit seulement que l'iframe a fini de charger *un* document. En cas d'erreur réseau, Chromium affiche sa propre page d'erreur et déclenche quand même `load` : l'ouverture est comptée. Vérifié par le test client « network failure of the iframe » (`route.abort('connectionrefused')`). Une page d'erreur servie par DISH (5xx) est de même indiscernable. Un bloqueur qui empêche toute réponse laisse l'ouverture en attente (non comptée).
- `load` ne dit jamais qu'une réservation a été faite. Le comptage des confirmations reste à l'arrêt (aucun changement de comportement à ce sujet).

## Ingestion (`POST /api/reservation-requests`)

- Corps accepté : exactement `{"path": "/" | "/carte" | "/mentions-legales"}`. Toute clé en plus, une query string, un hash ou un autre chemin donnent 400. Liste blanche à deux niveaux : `lib/reservation-requests/paths.ts` et la contrainte `CHECK` en base.
- `Origin` doit valoir exactement `APP_ORIGIN` (403 sinon, y compris s'il manque) ; `Sec-Fetch-Site` doit être `same-origin` quand il est présent ; seul `application/json` est accepté (sinon 415) ; corps limité à 128 octets, lus en flux quel que soit `Content-Length` (sinon 413). GET et les autres méthodes répondent 405.
- La route ne lit ni cookie, ni IP, ni user agent, et ne journalise pas le corps. Le client envoie `credentials: 'omit'`. Réponse 204 `no-store`, sans `Set-Cookie`.
- Horodatage : `UTC_TIMESTAMP(3)` côté base, jamais l'heure du client.

## Limite globale (durable, atomique)

- `HOURLY_QUOTA = 200` ouvertures par heure UTC, **pour tout le site** (aucune clé par visiteur). Le compteur est stocké en base (`reservation_request_quota`), donc partagé par tous les processus Node et conservé après un redémarrage.
- Dans une même transaction : upsert du compteur (verrou exclusif sur la ligne), lecture, puis insertion de l'événement ; au-delà du quota, rollback et réponse 429. Le compteur et l'événement sont validés ensemble, ou pas du tout.
- **Corrigé dans cette étape** : une transaction choisie comme victime d'un deadlock InnoDB (upserts concurrents de la même nouvelle ligne) est relancée, jusqu'à 3 tentatives (`ER_LOCK_DEADLOCK`, `ER_LOCK_WAIT_TIMEOUT`). C'est sans risque, car un rollback annule tout.
- **Corrigé** : la purge des fenêtres de plus de 2 jours tournait à chaque requête, après le commit, et une erreur à ce moment faisait répondre 503 alors que l'événement était déjà enregistré. Elle ne tourne plus qu'une fois par heure (requête qui ouvre la fenêtre) et ses erreurs sont ignorées.
- Effet réel de la limite : au-delà de 200 ouvertures dans la même heure UTC, les suivantes sont perdues (le client ignore le 429). C'est expliqué sur la page admin. Pire cas de volume : environ 1,8 million de lignes par an. Les événements sont conservés sans purge.

## Migration `0006_create_reservation_request_metrics.sql`

- **Additive uniquement** : trois `CREATE TABLE IF NOT EXISTS`, aucune table existante modifiée. On peut la relancer après une exécution interrompue (le DDL MySQL n'est pas transactionnel).
- Colonnes : `events(id, occurred_at, path)`, `tracking(id=1, activated_at)`, `quota(window_start, hits)`. Aucune donnée personnelle.
- Application **en local** : `npm run db:up` puis `npm run db:migrate` (lit `.env.local`). En production, elle fait partie de la procédure manuelle du client. **Rien n'a été appliqué en production ni sur une base distante dans cette étape.**

## Activation

- `reservation_request_tracking.activated_at` est fixé une fois pour toutes (`INSERT IGNORE`) par le premier événement enregistré ou par le premier affichage du rapport admin (sous-page ou encart `/admin`), selon ce qui arrive en premier. Les deux supposent que le code est déployé. Pas d'antidatage.
- Avant l'activation, les jours et les semaines sont « indisponible », jamais 0. Le jour d'activation et le jour courant sont marqués « (partiel) ». Les jours à venir affichent « — ».
- Ordre de mise en ligne : appliquer la migration **avant** le code. Si le code arrive avant, l'endpoint répond 503 (événements perdus), la sous-page affiche « momentanément inaccessibles », et l'encart `/admin` affiche « Statistiques momentanément inaccessibles » sans bloquer la gestion de la carte.

## Reporting admin (authentifié)

- **Encart sur `/admin`** (ajouté dans cette étape) : semaine en cours, semaine dernière (lundi → dimanche) et mois en cours, avec un lien vers le détail (`components/admin/ReservationRequestsSummary.tsx`). Une panne de base n'affecte que l'encart.
- **Sous-page `/admin/demandes-de-reservation`** : un mois par jour et par semaine (semaines du lundi au dimanche, totalisées en entier même à cheval sur deux mois). Navigation `?mois=YYYY-MM` entre plusieurs mois, bornée au mois d'activation et à 24 mois au plus. Une valeur hors bornes ou mal formée ramène au mois le plus proche ou au mois courant. Les jours observés sans événement affichent 0.
- Jours en heure de Paris : les heures UTC sont agrégées par jour de Paris via `Intl` (changements d'heure inclus : journées de 23 h et 25 h). Les deux pages appellent `requireAdmin()`, et l'en-tête admin a un lien « Demandes de réservation ».

## Preuves réellement exécutées (31/10/2026, cette machine)

| Commande | Résultat |
| --- | --- |
| `npm test` (WIP d'origine) | 19 fichiers, 287 tests OK |
| `npm test` (après corrections) | 20 fichiers, **294 tests OK** (nouveaux : résumé admin, reprise après deadlock, purge non bloquante, rollback hors quota) |
| `npm run lint` | OK, aucune erreur |
| `npm run typecheck` | OK |
| `npm run build` | OK : routes `/admin`, `/admin/demandes-de-reservation` et `/api/reservation-requests` générées |
| Smoke test `next start` + `curl` sur l'endpoint (requêtes rejetées uniquement) | cross-origin 403, sans Origin 403, `Sec-Fetch-Site: cross-site` 403, `text/plain` 415, query string 400, clé en plus 400, `/admin` 400, corps de 300 octets 413, GET 405 |

Le smoke test n'a envoyé aucune requête valide, pour que le serveur ne touche à aucune base, quelle que soit sa configuration d'environnement.

### Corrections de la revue 1 (31/10/2026, cette machine)

Logs bruts (chemins locaux masqués, aucune donnée personnelle) : `evidence/logs/`.

| Commande | Résultat |
| --- | --- |
| `npm run lint` | OK (`lint.log`) |
| `npm run typecheck` | OK (`typecheck.log`) |
| `npm test` | 21 fichiers, **308 tests OK** (`unit.log`), dont 14 nouveaux dans `lib/reservation-requests/opening.test.ts` : chargement différé, fermeture avant `load`, réouverture en attente, réouvertures après chargement, `load` répétés, re-rendus, quitté avant `load`, occultation avant la première demande puis reprise sans doublon, onglet masqué, nettoyage |
| `npm run build` | OK (`build.log`) |
| `npx playwright test -c playwright.client.config.ts` (après le build, jamais en parallèle) | **10 tests OK**, 1 worker, Chromium (`client-browser.log`) |

`playwright.client.config.ts` : aucun `globalSetup`, aucun fichier `.env` lu par la config, serveur `next start` local sur `127.0.0.1:3190` avec `DATABASE_URL` explicitement vide et `APP_ORIGIN` local (aucun `.env*` n'existe dans ce worktree ; `next start` en chargerait un s'il existait). **Stubs déclarés** : l'iframe DISH est servie par `page.route` (page factice retenue jusqu'à libération) et `POST /api/reservation-requests` reçoit un 204 de `page.route`, sans atteindre le serveur. Ces tests prouvent *quand le client envoie*, pas la persistance. Aucun accès live ni DISH. Le serveur est arrêté par Playwright en fin de run ; aucun port 3190 en écoute ensuite (vérifié).

Non fait : contre-épreuve par mutation (désactiver l'occultation et reconstruire pour voir le test échouer).

## Non exécuté : blocages

- **Tests d'intégration (`npm run test:integration`)** : non lancés. Aucune base locale n'a pu être prouvée sur cette machine : pas de Docker, pas de binaire MariaDB/MySQL, aucun port 3306/3307 en écoute. Installer quoi que ce soit était hors périmètre, et `.env*` n'a pas été lu. Les tests existent (`tests/integration/reservation-requests.test.ts` : migration additive et relançable, colonnes sans données personnelles, quota concurrent à 25 requêtes et sur deux pools, purge, activation, regroupement par jour de Paris autour du changement d'heure, endpoint) et j'ai ajouté un cas `loadSummary`. **À exécuter dès qu'une base locale `*_test` est disponible.** La migration 0006 n'a donc été appliquée sur aucune base dans cette étape.
- **Tests e2e Playwright** (`tests/e2e/reservation-requests.spec.ts` pour tous les CTA ordinateur/mobile, le module intégré, la réouverture et l'absence de doublon ; `tests/e2e/admin/reservation-requests.spec.ts`) : non lancés. Ils dépendent de la même base de test, et la QA navigateur est prévue après cette étape. Les captures `docs/reservation-requests-evidence/` n'existent donc pas encore.
- Aucun audit live, aucun appel à l'API DISH, aucune réservation réelle, rien en production, aucun push.

## Points d'attention pour la QA et la revue

- Occultation : seuls le menu mobile de la navbar et les `<dialog>` ouverts sont détectés. Un autre élément posé par-dessus (bannière d'un navigateur, extension) ne l'est pas.
- Les specs DB `tests/e2e/reservation-requests.spec.ts` n'ont pas été modifiées : elles libèrent le stub DISH immédiatement, ce qui reste compatible avec l'attente de `load`. Elles sont toujours à exécuter avec la base de test.
- L'affichage du rapport admin écrit la ligne d'activation lors d'un GET (une seule fois).
- Le quota est fixe par heure UTC : jusqu'à 2 × 200 ouvertures possibles à cheval sur deux heures.
- Le spec e2e admin clique le lien « Demandes de réservation » de l'en-tête. Le lien de l'encart a un autre libellé (« Voir le détail… »), pour éviter une ambiguïté de sélecteur.
