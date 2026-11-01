# DISH — réservations validées issues du site : comparatif avant décision

Date : **1er novembre 2026**, Europe/Paris. Auteur : Jeff, ROBBIZ. Destinataires : Théo via NORA.

**Statut : investigation documentaire terminée ; décision humaine attendue. Aucune solution implémentée, aucun code approuvé.**

## 1. Contrat courant et conclusion

Le mandat du commentaire NORA du 1er novembre remplace le compteur d’ouvertures : afficher uniquement les réservations **validées, effectuées depuis le site propre**, avec **date du repas, heure et nombre de couverts**. Aucun nom, email, téléphone, note client ni autre donnée client. Les corrections et la QA du compteur sont en pause ; son WIP et la draft PR #3 sont conservés, pas proposés à la fusion.

**Aucune des quatre pistes n’est aujourd’hui prouvée conforme de bout en bout pour ce restaurant.** Ce n’est ni « impossible », ni « aucun signal DISH ». Il manque la preuve de provenance exacte et du cycle de vie d’une réservation réelle, ou un contrat fournisseur qui les garantisse.

**Recommandation :** faire valider par Théo les deux brouillons ci-dessous, puis obtenir d’abord une réponse du support sur le canal « site propre », les données et la synchronisation, ainsi que quelques échantillons déjà existants et anonymisés par le restaurant. Un test réel unique, convenu avec le restaurant, viendra seulement si nécessaire et après autorisation distincte. Ne pas coder un compteur de confirmations à partir d’un clic, d’un chargement d’iframe ou d’un email dont le canal serait ambigu.

## 2. Travail réellement effectué et limites

### Vérifié dans cette reprise

- `git fetch origin`, branches, historique et worktrees inspectés le 1er novembre ; branche de travail récente : `TheoROB/feat-reservation-requests`, head initial local et distant `b1b198aebf666469453250e77c1f1644d7127817`.
- PR #3 relue avec GitHub CLI : **OPEN, DRAFT**, même head initial. Checkout principal sur un ancien `main` : il n’a pas servi de base à une réimplémentation.
- Instructions `AGENTS.md` du worktree lues : mise en ligne manuelle, aucun déploiement automatique. Aucun README à ces emplacements.
- Terminaux Orca inventoriés : aucun nouveau worker lancé, aucun terminal existant ni processus inconnu arrêté. Une seule investigation, pas de développement parallèle.
- Audit archivé du 30 octobre et rapport de QA du 31 octobre relus, sans répéter leurs essais live.
- Guides officiels publics consultés dans le navigateur le 1er novembre : intégration, onboarding et notifications.[1][2][3]
- Lecture des guides d’export, d’impression et des rapports.[4][5][6]
- Lecture des réglages et canaux Google/Facebook/Instagram.[7][8][9]
- Lecture des guides de statut, de réservation manuelle avec garantie et de gestion quotidienne.[10][12][13]
- Lecture du guide de démarrage, de l’offre France et de la FAQ Pays-Bas ; les différences de produit/pays sont conservées dans l’analyse.[18][15][11]
- PDF officiel « Reports » téléchargé et texte extrait : il décrit les sources dans Insights, mais aucun schéma exportable par réservation n’est établi par cette extraction.[16]
- Recherche de l’aide officielle : `webhook` et `postMessage` n’ont retourné aucun résultat ; `API` a retourné des articles DISH Order, pas de contrat DISH Reservation dans les résultats affichés.[17] C’est une recherche bornée, **pas une preuve d’absence d’API privée/partenaire**. Recherche externe Google bloquée ; résultats Bing non probants, non utilisés comme sources techniques.

### Pas effectué

Aucun accès au back-office DISH ou à une boîte mail ; aucun export métier ni échantillon client reçu ; aucun test de confirmation, modification ou annulation ; aucun envoi au restaurant/support ; aucune réservation, saisie de coordonnées ou soumission de formulaire métier. Aucun appel d’API de production, scraping, contournement cross-origin, parseur, prototype, correctif, test DB, migration, merge ou déploiement. La configuration MariaDB mentionnée par Théo n’a pas été ouverte et n’était pas nécessaire.

Les preuves d’audit précédentes sont `evidence/dish-audit.md`, `evidence/dish-live-desktop.png`, `evidence/dish-live-mobile.png` ; ce rapport réutilise leur constat, il ne revendique pas un nouvel essai navigateur live.

### Convention de preuve

- **Observé antérieurement** : audit local archivé, date et limites rappelées.
- **Documenté** : ce que dit une source officielle publique ; pas une preuve de configuration du compte du restaurant.
- **Non vérifié** : accès ou essai absent.
- **Proposition** : recommandation d’ingénierie, pas comportement mesuré ni engagement de DISH.

## 3. Comparatif des quatre pistes

Les efforts sont des **ordres de grandeur Jeff**, non un devis. Un jour représente une journée de travail ; attentes restaurant/support exclues. Les fourchettes d’intégration sont conditionnelles à une preuve complète et à un nouveau mandat ; aucune réalisation n’est autorisée actuellement.

| Piste | Isolation des réservations du site propre | Date / heure / couverts / validation | Fiabilité et synchronisation | Accès minimal | Effort estimé et justification |
|---|---|---|---|---|---|
| **1. Signal ou page de confirmation** | **NON VÉRIFIÉ.** Une émission liée à une iframe présente sur le site ne démontre pas à elle seule l’attribution conservée côté DISH. | **NON VÉRIFIÉ côté parent.** Aucun événement final ni page finale exercés. | Cross-origin observé ; contrat final inconnu. Le navigateur seul ne couvre pas les changements ultérieurs faits ailleurs. | Contrat officiel d’événement/redirection et sandbox, sinon test réel expressément autorisé avec opérateur. | Validation 0,5–1 j : protocole + succès/échec et source. Si contrat exploitable : 2–4 j pour réception, validation et QA ; suivi des annulations **non inclus tant que mécanisme inconnu**. |
| **2. Emails restaurant** | **NON VÉRIFIÉ.** « Email de confirmation » ou « en ligne » ne vaut pas « site propre ». | Notifications documentées ; **présence de ces quatre champs dans le mail restaurant non vérifiée**, aucun échantillon reçu.[2][3] | Pas de preuve d’exhaustivité, identifiant stable, notifications d’édition/annulation ou ordre de livraison. Option fragile si modèles variables. | Extraits anonymisés existants par canal/statut, configuration de notifications décrite par l’opérateur ; aucun accès global à la boîte. | Validation 0,5–1 j : comparer modèles et champs. Si complets : 3–5 j pour ingestion, filtrage, gestion des répétitions et QA ; traitement des données personnelles à autoriser séparément si mails bruts requis. |
| **3. Export DISH** | **NON VÉRIFIÉ.** Insights documente des sources, pas le champ de provenance exacte d’un export individuel.[6] | Export de données et impression PDF documentés ; **schéma, types et statut confirmé par ligne non vérifiés**.[4][5] | Candidat pour relevé périodique, pas temps réel. Un PDF ponctuel ne garantit pas la mise à jour après annulation. | En-têtes + quelques lignes minimisées/anonymisées, périmètre, filtres et date d’extraction ; pas d’export massif. | Validation 0,5 j. Si snapshot complet filtré conforme : 2–4 j pour import/remplacement de période et QA. Coût opérateur récurrent à mesurer sur un seul relevé autorisé, pas estimable sans voir le format. |
| **4. API / webhook contractuels** | **NON VÉRIFIÉ.** Aucun champ ni contrat applicable au compte France obtenu. | **NON VÉRIFIÉ.** Disponibilité, éligibilité, coût, droits et champs à confirmer. | Meilleur candidat structurel **si** source exacte, statut, version, annulations, reprise et minimisation sont garantis. Ce « si » n’est pas acquis. | Réponse écrite support, doc officielle applicable France, sandbox et accès lecture seule minimisés via coffre après accord. | Validation 0,5–1 j après réception de docs. Si contrat complet : 3–6 j pour intégration, sécurité, réconciliation et QA ; hors accès/contrat fournisseur. Incertitude forte, taille à requalifier avant accord. |

**Verdict comparatif :** aucun « oui » démontré pour le filtre site propre. Ne pas arbitrer uniquement sur le coût d’un parseur : l’absence d’origine exacte ou de réconciliation invaliderait le résultat métier, même avec date/heure/couverts disponibles.

## 4. Détail des pistes et preuves

### 4.1 Signal ou page de confirmation

**Observé antérieurement, 30 octobre :** l’iframe `reservation.dish.co` est cross-origin ; le parent n’accède pas à son document ni à son URL interne (`SecurityError`). Aucun message de cette origine n’a été observé pendant ouverture/fermeture desktop/mobile. **Le parcours final n’a pas été atteint** : la confirmation demeure **NON VÉRIFIABLE**, et non absente. Voir `evidence/dish-audit.md`.

**Documenté :** le guide d’intégration décrit HTML embarqué et lien pop-out. Il ne fournit pas dans le texte consulté de contrat de confirmation avec type/version, données, origine et garanties.[1] Les réglages permettent une confirmation automatique selon la taille de groupe ; des demandes peuvent donc nécessiter une acceptation.[7][12]

**Inconnues :** signal final éventuel, champs transmis au parent, moment exact « demande » versus « accepté », attribution du canal, possibilité d’un retour de confirmation accessible, répétition au reload et comportement d’erreur. Aucun de ces éléments n’est déduit de l’existence du formulaire.

**Proposition de validation :** recevoir la documentation DISH, puis tester un succès approuvé et un contrôle sans succès. Un événement éventuel devra avoir une origine exacte, une source d’iframe attendue, un type et un statut définis, ainsi que date/heure/couverts et provenance vérifiables. Une redirection accessible ne sera pas assimilée à une confirmation si son URL peut être visitée sans succès métier. Aucune instrumentation ne devra conserver de payload client.

**Limite de principe de la proposition :** un signal uniquement navigateur peut être raté (fermeture, réseau) et une ingestion publique peut être falsifiée ; il ne fournit pas à lui seul une preuve serveur authentifiée. Surtout, une modification faite plus tard par téléphone ou dans DISH n’est pas visible sur l’ancienne page du client. Un autre mécanisme fournisseur de réconciliation serait nécessaire.

### 4.2 Emails de notification

**Documenté :** l’onboarding prévoit l’email du restaurant à notifier lors de réservations ; les réglages permettent de choisir des notifications et de personnaliser le message de confirmation invité.[2][3] **Cela ne documente ni le modèle exact du mail restaurant, ni un champ d’origine par réservation.**

Le guide de démarrage indique aussi qu’une réservation reçue par téléphone, saisie manuellement, peut générer une confirmation si un email est fourni.[18] Un autre guide décrit une réservation manuelle d’abord en attente de garantie, puis confirmée avec envoi d’email.[10] **Conséquence : la seule présence d’un email ou du mot « confirmé » ne prouve pas une réservation depuis le site.** Aucun réglage de garantie du restaurant n’est présumé actif.

**À obtenir :** pour chaque canal réellement utilisé, un extrait expurgé montrant les libellés exacts et les champs non personnels. Conserver l’information « champ d’origine présent/absent » ; ne pas substituer un canal déduit par l’opérateur à un champ inexistant. Comparer demande en attente, confirmation, modification et annulation, lorsqu’il existe déjà de tels messages. Aucun mail brut ou transfert automatique vers ROBBIZ.

**Risques à qualifier :** traductions/modèles, absence d’email pour certains événements, doublons, transfert retardé, ordre inversé et lien technique commun entre notifications. Il s’agit de risques de conception à tester, pas d’incidents constatés sur ce compte.

### 4.3 Exports

**Documenté :** `Settings → Account → My Data → Export Data` permet un export.[4] Le guide ne donne pas de schéma CSV/JSON, fréquence automatique, filtres de provenance ou garantie de présence d’un statut confirmé. Ne pas annoncer un export CSV utilisable sans échantillon.

Autre fonction distincte : impression des réservations d’une date/plage, avec sélection `Completed`, `Upcoming` ou `All`, puis sauvegarde PDF.[5] **Ces vues temporelles ne constituent pas un contrat « confirmed uniquement ».** Le rapport Insights documente les sources et des périodes semaine/4 semaines/année, pas leur disponibilité dans les exports ni la taxonomie exacte.[6][16]

**Inconnues :** format, colonnes, fuseau, statut actuel ou événement historique, distinction site propre/autres sites/Google, conservation des annulations et disponibilité des modifications. L’export « My Data » peut être plus large que le besoin ; son contenu n’a pas été examiné. Ne pas le demander en entier.

**Proposition :** préférer, si réellement disponible, un relevé complet d’une petite période, filtré à la source par canal exact et statut validé, ne contenant que les champs autorisés. S’il devient la base de l’admin, afficher la date de dernière actualisation et accepter explicitement le délai manuel. Un export incomplet ou excluant silencieusement des lignes n’autorise pas à déduire une annulation par absence.

### 4.4 API / webhook

**Documenté mais non transposable :** la FAQ officielle Pays-Bas mentionne DISH Table Reservation et des intégrations partenaires, notamment Bookdinners avec un token. La même page distingue le support de certains produits achetés via Makro.[11] **Ce n’est pas une preuve d’API ouverte, d’éligibilité de DISH Reservation France ou d’accès pour ce restaurant.** L’offre France consultée décrit des réservations via site ou Google, sans établir le contrat API/webhook recherché.[15]

L’aide publique explorée n’a pas livré de contrat Reservation avec source exacte, statuts et événements de cycle de vie.[17] **Disponibilité inconnue**, pas « API inexistante ». Aucun endpoint interne observé dans le navigateur n’est proposé comme API autorisée.

**Proposition :** demander accès officiel lecture seule ou livraison de messages minimisés, avec authentification/signature, identifiant/version, reprises, événements de modification/annulation et une méthode de réconciliation. Les conditions commerciales et le compte France doivent être confirmés avant chiffrage ferme. Aucun secret n’est à envoyer dans une réponse support ou un commentaire Kanban.

## 5. Origine, statut et déduplication : critères bloquants

### Origine « site propre »

Les canaux site et Google existent dans la documentation France ; les guides décrivent aussi Google et Facebook/Instagram.[15][8][9] Cela ne prouve pas lesquels sont actifs pour ce restaurant. Le guide Google propose notamment de copier un lien pop-out vers Google Business.[8] **Donc l’identifiant du restaurant/widget, ou le seul domaine DISH, ne doit pas être assimilé à un marqueur exclusif du site.**

Demander une définition écrite de `source/channel/origin` : site propre intégré, autre site utilisant le même widget/lien, Google natif, lien depuis Google, réseaux sociaux, portail DISH, téléphone/saisie manuelle et walk-in. Un « online » global ne satisfait pas le filtre. Un référent HTTP ou paramètre inventé ne sera pas traité comme une attribution fournisseur garantie. Le parcours « Google → site du restaurant → widget » devra être arbitré par Théo : proposition métier, compter la réservation initiée effectivement dans le widget du site, et non l’acquisition publicitaire initiale.

### Validation et synchronisation

La documentation distingue demandes à accepter/refuser et réservations confirmées, puis états tels qu’arrivée et annulation.[12] Le guide général simplifie certaines catégories ; les valeurs machine et leur sémantique doivent donc être obtenues du fournisseur, pas inférées des libellés d’un tutoriel.[18][12]

**Décision métier requise :** afficher les réservations actuellement valides (proposition recommandée), ou l’historique de celles ayant été validées un jour, y compris annulées ? Le premier choix implique suppression/mise à jour après annulation et changement de date/heure/couverts. Les arrivées et prestations terminées ne doivent pas disparaître à tort si l’admin montre un historique ; définir aussi le traitement des no-show.

### Déduplication sans donnée client : proposition conditionnelle

- **Ne pas** dédupliquer sur `(date du repas, heure, couverts)` : deux tables différentes peuvent avoir exactement ces valeurs. Ne pas ajouter email, IP, cookie ou empreinte de visiteur pour compenser.
- Pour un flux d’événements, il faudrait une clé stable et une version/clé d’événement contractuelles afin de gérer répétitions, ordre et annulations. **Un ID de réservation, même haché, n’est pas présumé non personnel** : il peut rester corrélable côté fournisseur. S’il contredit la contrainte stricte de Théo, cette architecture n’est pas recevable sans nouvelle décision explicite.
- Alternative **à faire confirmer par DISH**, sans identifiant de réservation dans notre stockage : snapshot fournisseur complet, déjà filtré « site propre + statut conforme », avec uniquement date/heure/couverts ; remplacement atomique de la période et conservation des lignes identiques légitimes, pas déduplication par tuple. La complétude, la cadence et la cohérence du snapshot sont indispensables ; un email isolé n’offre pas ces garanties.
- Sans clé admissible **ni** snapshot complet fiable, aucune garantie honnête de déduplication et de synchronisation n’est possible. Dans ce cas, rester dans DISH pour la consultation, plutôt qu’afficher des chiffres présentés comme exhaustifs.

Ce sont des pistes d’architecture, **pas un schéma arrêté ni une autorisation de coder**. Les procédures de scoping/architecture ROBBIZ ne sont pas encore formalisées ; une nouvelle estimation suivra les preuves.

## 6. Brouillon 1 — demande au restaurant, NON ENVOYÉE

> Objet : accord de principe pour vérifier les réservations provenant de votre site — aucun test lancé
>
> Bonjour,
>
> Avec l’accord préalable de Théo, nous souhaitons vérifier si DISH permet d’afficher dans votre espace admin les seules réservations validées depuis votre site, uniquement avec la date du repas, l’heure et les couverts. Nous ne vous demandons ni accès à votre messagerie, ni données de clients.
>
> Pourriez-vous d’abord indiquer les canaux utilisés et fournir, si vous en possédez déjà, quelques exemples **anonymisés par vos soins** de notifications et d’extraits d’export : réservation du site, autre canal en ligne, téléphone/saisie manuelle, puis éventuelle modification/annulation ? Merci de supprimer noms, emails, téléphones, notes, coordonnées des destinataires, références, liens d’action, QR codes et tout élément permettant de retrouver une personne. Laisser les libellés de champs visibles, en particulier origine et statut ; signaler explicitement lorsqu’un champ manque. Aucun export intégral n’est demandé.
>
> Si ces éléments et la documentation ne suffisent pas, accepteriez-vous ensuite un test unique convenu ensemble, après validation séparée de Théo ? Merci de proposer un **créneau précis** et un nombre de couverts acceptables (deux couverts proposés uniquement si cela vous convient), le responsable sur place qui constatera la validation DISH, et la procédure de gestion de cette réservation d’essai. Si elle doit être annulée, nous souhaitons convenir avant le test de qui le fera, à quel moment, sans frais ni effet indésirable.
>
> Rien ne sera réservé ni annulé sur la base de ce seul message : nous vous soumettrons un récapitulatif pour accord. Aucun envoi ou contact n’a encore été effectué.
>
> Merci.

### Protocole proposé — inactif tant que Théo n’a pas approuvé

1. **Préconditions écrites :** restaurant d’accord ; créneau/date complète/heure Europe/Paris et couverts arrêtés ; responsable restaurant et exécutant désignés ; gestion/annulation et frais éventuels clarifiés ; autorisation explicite de Théo sur la soumission précise. Préférer un environnement de test DISH. Aucune réservation de contrôle supplémentaire implicite.
2. **État initial :** opérateur décrit les canaux et la règle d’auto-acceptation, sans changer les réglages ; valider la définition « depuis le site ». Aucune capture de liste clients.
3. **Parcours site autorisé uniquement :** observation passive du parent et de la transition finale, métadonnées strictes (horodatage technique, origine, source, nom/type/version du signal, présence de champs attendus). Pas de payload brut, URL avec token, HAR complet ou console de données client. Les coordonnées éventuellement requises sont gérées par l’opérateur désigné, jamais demandées en chat, journalisées ou conservées par ROBBIZ.
4. **Vérification métier indépendante :** le restaurant atteste dans DISH si c’est `en attente`, `accepté/confirmé` ou `refusé`, et si l’origine exacte du site est visible. Il compare date du repas/heure/couverts au résultat de l’observation ; il ne suffit pas de voir une page « merci ». Si l’acceptation est manuelle, vérifier le signal au moment de cette acceptation, pas uniquement l’envoi initial.
5. **Contrôle négatif sans réservation supplémentaire :** abandon avant soumission/fermeture du module ; aucun signal de succès attendu. Réouverture/reload après le succès uniquement si la procédure ne crée rien ; vérifier répétitions sans enregistrer de données client. Ne pas provoquer un échec serveur ni multiplier les soumissions réelles.
6. **Cycle de vie :** utiliser d’abord des exemples historiques anonymisés. Si une modification ou annulation du test est nécessaire, elle exige le scénario et le responsable convenus à l’étape 1 ; notre session ne l’exécute pas sans autorisation distincte. Le responsable restaurant confirme l’état final et l’absence de table bloquée.
7. **Sortie :** rapport « testé/non testé » pour chaque critère, captures expurgées si utiles, aucun mail brut/identifiant. Si pas d’origine fiable ou de signal final, conclure sur la limite réellement observée, pas sur l’inexistence universelle de la fonctionnalité.

**Arrêt avant l’étape 3 aujourd’hui. Aucun créneau réservé, aucune identité de test collectée.**

## 7. Brouillon 2 — questions au support DISH, NON ENVOYÉES

> Objet : DISH Reservation France — accès officiel minimisé aux réservations confirmées du site propre
>
> Bonjour,
>
> Nous étudions, pour un restaurant équipé de DISH Reservation en France, un affichage interne limité aux réservations validées provenant de son propre site : date du repas, heure et nombre de couverts, sans aucune donnée client. Avant tout développement, pourriez-vous confirmer :
>
> 1. Existe-t-il une API officielle lecture seule, un webhook, un export filtré automatisable ou un événement/document de confirmation pour le widget ? Quels produits/abonnements/pays sont éligibles, à quel coût éventuel, avec quelle procédure d’accès et quelle documentation/version ? Disposez-vous d’une sandbox ? Aucune clé secrète ne doit être jointe à votre réponse.
> 2. Peut-on distinguer **site propre intégré** des réservations via portail DISH, Google natif, lien DISH depuis Google, autres sites partageant un lien/widget, Facebook/Instagram, téléphone, saisie manuelle et walk-in ? Quelles sont les valeurs exactes du champ d’origine, comment sont-elles attribuées et persistent-elles après modification ? Un widget dédié au site est-il disponible avec attribution garantie ?
> 3. Quels champs fournissent date du repas, heure/fuseau, couverts, état en attente/accepté/confirmé/refusé/annulé, et changements ultérieurs ? Une confirmation automatique et une acceptation manuelle produisent-elles la même preuve ?
> 4. Quels identifiants techniques minimaux et versions d’événement permettent les doublons, mises à jour et annulations ? Ces références sont-elles corrélables à un client ? Peut-on recevoir à la source uniquement les trois champs métier, la provenance et le statut, sans coordonnées ni notes ? Un snapshot complet filtré et cohérent est-il possible sans ID de réservation chez nous ?
> 5. Quelles garanties pour authentification/signature, rejeu, répétitions, ordre de livraison, retries, reprise après indisponibilité, rétention des événements, limites de débit et réconciliation ? Comment détecter une modification ou annulation effectuée depuis un autre canal ?
> 6. Les emails destinés au restaurant et les exports incluent-ils un champ **site propre** distinct de « en ligne », le statut courant et une référence technique stable ? Quels événements déclenchent ces notifications et peut-on en obtenir des exemples anonymisés officiels ? Quelles colonnes/format et cadence pour l’export ?
> 7. S’il existe un signal au parent ou une redirection : origine autorisée, type/version, moment exact d’émission, champs disponibles, comportement sur refus/attente/reload et vérifiabilité serveur ? Est-il contractuellement supporté, sans lire le document cross-origin ni utiliser une API interne ?
>
> Nous ne sollicitons pas d’accès aux données de production à ce stade, ni d’envoi de données clients. Merci de privilégier la documentation et des exemples anonymisés. La référence d’établissement nécessaire pourra être transmise ultérieurement par son représentant autorisé via le canal approprié.
>
> Merci.

## 8. Accès et échantillons précis à obtenir

| Élément demandé | Fournisseur / accès | Critère de sortie et minimisation |
|---|---|---|
| Liste des canaux actifs et règles de validation | Restaurant ; description ou vue de réglages expurgée par l’opérateur | Distinguer source exacte et confirmation automatique/manuelle ; aucun changement de configuration. |
| Notifications existantes | Restaurant, sans accès ROBBIZ à la boîte | Un exemple site confirmé, un autre canal en ligne, un téléphone/manuelle ; si existants, attente, modification et annulation. Chaque cas absent reste « non fourni », pas de création pour combler. Texte/colonnes sans PII, références ni liens ; libellés d’origine/statut préservés. |
| Échantillon export minimal | Restaurant avec droit d’export, préparé localement par lui | En-têtes exacts, format/encodage, définition des dates/fuseau, provenance et statut si présents, quelques lignes anonymisées/expurgées. Pas de dump de compte ; si anonymisation sûre impossible, description des champs en premier. |
| Correspondance de cycle de vie anonymisée | Restaurant ou sandbox DISH | Même cas marqué par une étiquette de dossier d’essai non client dans le document transmis, avant/après modification/annulation ; pas de référence réelle de réservation. Ne vaut pas contrat machine. |
| Contrat officiel produit France | Support DISH via contact autorisé après validation du brouillon | Documentation, éligibilité/coût et définition d’origine, statut, données et réconciliation. Aucun token/secret dans Kanban. |
| Sandbox ou test réel unique cadré | Théo + restaurant | Accord sur créneau/couverts/exécutant/responsable/annulation, puis autorisation distincte de Théo. Si login nécessaire, accès via coffre navigateur ; jamais valeurs en chat. |

Pas de besoin MariaDB, identifiants admin du site, accès global mail, carte bancaire ou données de clients pour cette décision documentaire.

## 9. Décisions attendues de Théo via NORA

1. **Valider, modifier ou refuser les deux brouillons avant tout envoi** ; désigner qui contacte restaurant et support. Jeff n’a rien envoyé.
2. Demander d’abord réponse fournisseur et échantillons existants anonymisés (recommandé), ou autoriser ultérieurement un test réel précis après accord restaurant. **Ce rapport ne demande pas une autorisation générale de réserver.**
3. Confirmer la sémantique « réservations actuellement valides » et le traitement historique des annulations/arrivées/no-show ; confirmer la définition d’origine en cas de passage par Google vers le site.
4. Confirmer la contrainte stricte d’absence de tout identifiant corrélable. Si elle est maintenue, exiger un snapshot minimisé complet ou constater la limite ; ne pas la contourner par hachage.
5. Choisir une piste seulement quand **origine site + statut validé + date/heure/couverts + réconciliation** sont prouvés ; décider de la fraîcheur acceptable si import manuel.

**Point d’arrêt maintenu : aucune implémentation de confirmation, aucun compteur d’ouvertures repris. La PR #3 reste une sauvegarde non validée.** Les défauts de revue et dettes antérieurs (ResourceTiming/onglet masqué, rétention, alertes dépendances) ne sont ni corrigés ni revalidés ici ; voir `qa-resume.md` pour leur état daté, pas un audit actualisé. Pas de tests build/DB/QA relancés : aucun changement de code et hors mandat courant.

## Sources

[1] https://support.dish.co/en_GB/ehow-to-integrate-dish-reservation
[2] https://support.dish.co/reservation-starter-guide/tutorial-onboarding
[3] https://support.dish.co/dish-reservation-admin-panel-notifications
[4] https://support.dish.co/en_GB/dish-reservation-how-to-export-data
[5] https://support.dish.co/en_GB/c-mo-crear-un-archivo-pdf-de-tus-reservas
[6] https://support.dish.co/en_GB/dish-reservation-admin-panel-reports
[7] https://support.dish.co/en_GB/dish-reservation-admin-panel-settings-reservations
[8] https://support.dish.co/en_GB/reservation-comprehensive-guide-settings-reservations/how-to-integrate-the-reservation-tool-into-google-my-business-premium
[9] https://support.dish.co/en_GB/reservation-comprehensive-guide-settings-reservations/dish-reservation-how-to-activate-reserve-with-facebook-and-reserve-with-instagram
[10] https://support.dish.co/garantia-de-reserva-por-no-show/how-to-manually-create-a-reservation-requiring-a-credit-card-guarantee
[11] https://www.dish.co/NL/en/faq
[12] https://support.dish.co/en_GB/reservation-comprehensive-guide-reservations-and-table-plans-handling-of-reservations/dish-reservation-how-to-adjust-the-reservation-status
[13] https://support.dish.co/en_GB/reservation-comprehensive-guide-reservations-and-table-plans-handling-of-reservations/dish-reservation-admin-panel-reservations
[15] https://www.dish.co/FR/fr/application-reservation-restaurant
[16] https://dishtech.io/iorad/pdf/1678417-en.pdf
[17] https://support.dish.co/reservation
[18] https://support.dish.co/en_GB/reservation-starter-guide/dish-reservation-starter-guide
