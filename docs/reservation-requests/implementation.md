# Demandes de réservation : implémentation

Finalisation du WIP `61939ce` (branche `TheoROB/feat-reservation-requests`), le 31 octobre 2026.
Rien n'est déployé : la mise en ligne se fait à la main, par zip (voir `AGENTS.md`).

## Ce qui est compté

Une **demande de réservation** est une ouverture effective du module DISH (iframe) à l'écran d'un visiteur :

| Point d'entrée | Déclencheur | Code |
| --- | --- | --- |
| Bouton flottant « Réserver » (toutes les pages publiques, ordinateur et mobile) | `showModal()` réussi, dans le gestionnaire de clic | `components/reservation/ReservationCta.tsx` |
| Module intégré de l'accueil (`#reservation`), atteint par tous les liens « Réserver » (navbar, menu mobile, hero, famille, contact, footer) ou en défilant | au moins la moitié de l'iframe (ou la moitié de l'écran si elle est plus haute) visible 1 s, onglet visible | `components/reservation/InlineReservationTracker.tsx` |

- **Pas de doublon** : le modal compte dans le gestionnaire de clic (jamais dans un effet) et ignore un dialogue déjà ouvert. L'état du module intégré vit dans un seul effet (`[]`), donc un re-rendu n'y touche pas et le démontage nettoie l'observer, l'écouteur `visibilitychange` et le minuteur. Aucun identifiant n'est utilisé pour dédupliquer.
- **Réouverture volontaire = nouvelle demande** : fermer puis rouvrir le modal compte à nouveau. Le module intégré compte à nouveau après avoir entièrement quitté l'écran puis être revenu. Un clic sur un lien « Réserver » alors que le module intégré est déjà à l'écran et déjà compté ne compte pas : ce n'est pas une ouverture.
- Ce n'est ni un clic, ni une réservation (celles-ci restent dans DISH), ni un visiteur.

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

## Non exécuté : blocages

- **Tests d'intégration (`npm run test:integration`)** : non lancés. Aucune base locale n'a pu être prouvée sur cette machine : pas de Docker, pas de binaire MariaDB/MySQL, aucun port 3306/3307 en écoute. Installer quoi que ce soit était hors périmètre, et `.env*` n'a pas été lu. Les tests existent (`tests/integration/reservation-requests.test.ts` : migration additive et relançable, colonnes sans données personnelles, quota concurrent à 25 requêtes et sur deux pools, purge, activation, regroupement par jour de Paris autour du changement d'heure, endpoint) et j'ai ajouté un cas `loadSummary`. **À exécuter dès qu'une base locale `*_test` est disponible.** La migration 0006 n'a donc été appliquée sur aucune base dans cette étape.
- **Tests e2e Playwright** (`tests/e2e/reservation-requests.spec.ts` pour tous les CTA ordinateur/mobile, le module intégré, la réouverture et l'absence de doublon ; `tests/e2e/admin/reservation-requests.spec.ts`) : non lancés. Ils dépendent de la même base de test, et la QA navigateur est prévue après cette étape. Les captures `docs/reservation-requests-evidence/` n'existent donc pas encore.
- Aucun audit live, aucun appel à l'API DISH, aucune réservation réelle, rien en production, aucun push.

## Points d'attention pour la QA et la revue

- `IntersectionObserver` ne voit pas l'occultation : un module intégré visible sous le menu mobile ouvert pendant plus d'1 s serait compté. Le cas est rare, et la plupart du temps l'ouverture était déjà comptée.
- L'affichage du rapport admin écrit la ligne d'activation lors d'un GET (une seule fois).
- Le quota est fixe par heure UTC : jusqu'à 2 × 200 ouvertures possibles à cheval sur deux heures.
- Le spec e2e admin clique le lien « Demandes de réservation » de l'en-tête. Le lien de l'encart a un autre libellé (« Voir le détail… »), pour éviter une ambiguïté de sélecteur.
