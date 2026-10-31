# QA et état de reprise — 31 octobre 2026

## Verdict : FAIL / livraison bloquée, pas prête à fusionner

Branche exacte : `TheoROB/feat-reservation-requests`. WIP `61939ce` préservé. Code contrôlé : `65000c9369e3455466c3ae09558141983e0ab202`. Aucune modification de production, aucun déploiement, aucune migration exécutée, aucune réservation réelle, aucun code de confirmation. Pas de changement de dépendances ni de configuration CI.

## Preuves réellement exécutées par Jeff, séquentiellement après arrêt des workers

Le 31/10 entre 22:47 et 22:53 CET, sur ce worktree :

- `npm ci` : succès, 399 paquets installés. Avertissements : ESLint déprécié, script postinstall unrs-resolver bloqué par la politique existante. Aucun contournement ni approbation de script.
- `npm run lint` : succès.
- `npm run typecheck` : succès.
- `npm test` : **308/308 tests, 21/21 fichiers**.
- `npm run build` : succès. `DATABASE_URL is not set` : mode de repli du menu ; aucune preuve de connectivité DB n'en découle.
- `npx playwright test -c playwright.client.config.ts` : **10/10 tests, un seul worker**, 46,7 s. Vrai code de l'application locale ; **iframe DISH et ingestion remplacées explicitement par des stubs**. Aucun enregistrement SQL ni signal DISH réel testé par cette suite. Cas : chargement retardé, fermeture avant load, réouvertures, re-rendus, abandon, retour dans la vue, menu mobile et modal occultant l'inline. Le test erreur réseau constate que Chromium émet load sur sa page d'erreur : l'ouverture est comptée malgré l'échec.
- Vérification navigateur Orca locale : ouverture modal desktop ; passage iPhone 12 (390×844, DPR 3), fermeture par Échap avec restitution du focus au bouton Réserver, réouverture avec focus Fermer. Captures `evidence/qa-local-desktop-modal.png` et `evidence/qa-local-mobile-modal.png`. Formulaire embarqué observé sans saisie, sélection ni soumission. Aucune réservation créée. Ce contrôle local n'étend pas l'audit de confirmation et ne prouve pas l'enregistrement des ouvertures.
- Console Orca après ouverture desktop : liste de messages vide au moment du contrôle. Pas de garantie générale d'absence d'erreur réseau/console.
- Protection non authentifiée : `GET /admin/demandes-de-reservation` retourne **307 vers /admin/login**, `Cache-Control: private, no-store`; navigation navigateur aboutit au login. Aucun identifiant saisi. Authentification positive non testée.
- Serveurs de cette mission arrêtés et port 3190 libéré ; terminaux des workers fermés, onglet QA fermé. Aucun processus inconnu arrêté.

## Revue indépendante : CHANGES_REQUIRED (2 cycles)

Auteur Claude, reviewer Codex. Rapport final verbatim dans `review-2.md`.

1. **P1** : ancienne entrée Resource Timing pour le même src prise comme preuve du chargement d'une nouvelle iframe inline après navigation ; comptage prématuré possible.
2. **P2** : modal compté à load alors que l'onglet est masqué ; il devrait attendre le retour visible et abandonner si fermé.

Après deux cycles toujours bloquants, arrêt de la boucle de correction conformément à la procédure. **Aucune approbation de revue obtenue.**

## Non vérifié, à ne pas présenter comme réussi

- Aucun service MySQL local disponible : Docker, mysqld et mariadbd absents du PATH ; aucun port 3306/3307 à l'écoute. Aucun fichier .env lu, aucune installation serveur tentée.
- Migration 0006, persistance durable, quota concurrent multi-connexions, intégration SQL, affichage admin authentifié et navigation mensuelle réelle : **non exercés**. Tests existants prêts mais pas lancés faute de DB locale isolée.
- Suite e2e complète tous CTA desktop/mobile : **non exécutée** (dépend de la DB). Les dix tests client ciblés ne la remplacent pas.
- Nouvelles tables admin non capturées : pas de fausse capture ni de données inventées.
- Contraste/accessibilité des nouveaux tableaux admin et performance avec données réelles : à vérifier avec DB et session de test.

## Audit DISH : arrêt confirmation maintenu

Audit d'observation du 30/10 préservé dans `evidence/dish-audit.md` et deux captures live. Confirmation **NON VÉRIFIABLE**, pas « signal absent ». Aucun parcours final soumis. NORA a reçu le point d'arrêt ; aucun accord supplémentaire de Théo. Il faut une procédure sandbox/validation opérateur autorisée, puis validation du signal et de la déduplication sans PII avant tout code confirmation.

## Risques / décisions attendues de Théo via NORA

1. Autoriser une reprise corrective bornée des P1/P2 avec nouvelle revue et tests de régression, après cet arrêt de deux cycles.
2. Fournir une base de test locale isolée (`*_test`) et une procédure utilisable sans secrets exposés ; aucune migration production.
3. Décider si la métrique accepte l'ouverture visible d'une iframe ayant émis load, y compris page d'erreur. Sans contrat fiable côté DISH, le parent ne peut pas garantir le contenu fonctionnel cross-origin.
4. Dette : événements conservés indéfiniment, consultation limitée à 24 mois ; quota global épuisable et sous-comptage possible. Pas d'identifiant personnel ni d'IP ajouté pour compenser.
5. Dette sécurité relevée par `npm ci` puis `npm audit --json` : **19 alertes de dépendances (16 moderate, 2 high, 1 critical)**. Rapport brut sans secret `evidence/npm-audit.json`. Aucun audit fix exécuté ; manifestes et lock inchangés par cette mission. Triage sécurité séparé nécessaire avant décision de livraison ; ce résultat n'est pas une analyse d'exploitabilité ni une attribution de toutes les alertes au nouveau code.

La migration additive doit précéder une éventuelle mise en ligne manuelle, exclusivement après validation de Théo. Draft PR de sauvegarde seulement, aucun merge demandé ni autorisé.
