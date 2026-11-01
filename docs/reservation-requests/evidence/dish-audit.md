# Audit DISH — point d’arrêt pour Théo via NORA

Date : 30 octobre 2026 (Europe/Paris). Site live observé uniquement, aucune écriture métier.

## Essais réellement effectués
- Chargement de la page d’accueil live dans le navigateur Orca, ouverture du module par le bouton flottant desktop, fermeture ; émulation iPhone 12 (390 × 844, DPR 3), ouverture/fermeture du même module mobile ; retour à la section de réservation intégrée.
- Métadonnées parent : iframe d’origine `https://reservation.dish.co`, chemin `/widget/hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37`. L’accueil conserve son chemin `/` pendant les ouvertures.
- Accès JavaScript parent au document de l’iframe impossible : `contentDocument === null`, lecture de `contentWindow.location.href` refusée par `SecurityError`. Aucun contournement de la politique same-origin.
- Écoute passive des messages reçus par le parent depuis l’origine exacte `https://reservation.dish.co`, avant ouverture du modal. Seules les métadonnées (origine, type, noms de clés, longueur éventuelle) pouvaient être gardées, jamais les valeurs du payload.
- Aucun message de cette origine observé pendant les ouvertures/fermetures desktop et mobile. Cette observation ne porte PAS sur une confirmation.
- La vue accessible du formulaire DISH expose le choix du nombre de personnes, une date, les créneaux horaires et le bouton « Reserve now » (désactivé sans sélection). Aucun créneau sélectionné, aucune coordonnée saisie, aucun bouton de soumission activé. Pas d’appel API DISH, ni scraping de réservations.

## Verdict
**Signal de véritable confirmation : NON VÉRIFIABLE dans le périmètre autorisé.**
Le parcours final n’a pas été exercé : il demanderait de progresser dans un formulaire puis de créer une réservation réelle, ce qui est interdit. L’absence de message à l’ouverture ne prouve donc pas l’absence d’un signal après confirmation. Aucune redirection de confirmation n’a été observée puisque cette étape n’a pas été atteinte ; aucune documentation contractuelle de confirmation n’a été validée dans cet audit. Le guide officiel « How to integrate DISH Reservation into your website? », consulté dans le navigateur, décrit les formats intégrés/pop-out et la copie de HTML, pas un contrat d’événement de confirmation au parent. Cette consultation limitée ne prouve pas l’absence de documentation ailleurs. Source : https://support.dish.co/en_GB/ehow-to-integrate-dish-reservation ; snapshot accessible conservé (`dish-official-integration-guide.json`).

## Fiabilité, déduplication, risques
- Un clic ou l’ouverture visible de l’iframe est uniquement une demande de réservation au sens de l’étape 1, jamais une réservation confirmée.
- Pour une éventuelle phase future, vérifier en sandbox l’origine exacte ET `event.source` de l’iframe, un type/version documenté et un événement émis uniquement après réussite. Tester succès, erreur, annulation, reload et répétitions. Ne pas conserver le payload.
- Sans identifiant technique non personnel fourni et garanti par DISH, une déduplication durable de confirmations entre reloads/processus ne peut pas être garantie. Une garde en mémoire par cycle d’ouverture ne dédupliquerait que les répétitions de ce cycle, pas une même réservation relancée. Aucun identifiant de réservation n’est stocké ni proposé comme implicitement non personnel.
- L’ingestion publique d’ouvertures reste falsifiable ; un quota global sans IP limite le volume mais peut être épuisé et entraîner un sous-comptage. Les bloqueurs réseau et erreurs de chargement sont également des limites à documenter.

## Décision attendue de Théo
1. Fournir une procédure sandbox/test DISH et les droits nécessaires via le coffre navigateur, ou une validation opérateur explicitement autorisée hors production.
2. Valider le contrat de signal observé et la stratégie de déduplication avant toute implémentation confirmation.

**ARRÊT OBLIGATOIRE : aucune partie confirmation codée ; aucun compteur de réservations confirmées. L’étape 1 est indépendante. L’accord explicite de Théo est requis avant toute suite confirmation.**

## Preuves assainies jointes
`dish-live-desktop.png`, `dish-live-mobile.png` ; snapshots accessibles des modals desktop/mobile ; métadonnées parent desktop/mobile. Les vues ne contiennent aucune donnée de réservation soumise ni coordonnée client.
