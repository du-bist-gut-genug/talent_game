# ⭐ TALENT — Qui a vraiment le meilleur goût sur Internet ?

Jeu de soirée à deux écrans : **la télé** présente l'émission, **les téléphones** servent de télécommandes.
Chacun propose une vidéo YouTube ou Instagram sur un thème, tout le monde la regarde, réagit et vote.
Celui ou celle qui a le meilleur goût devient **ROI OU REINE DU CONTENU INTERNET**.

- Gratuit, sans compte, sans publicité.
- Aucun serveur de jeu : **la télé héberge la partie** et les téléphones s'y connectent en pair-à-pair (WebRTC).
- Fonctionne en Wi-Fi comme en 4G/5G, chacun sur sa propre connexion.

## Jouer

1. Sur la télé (ou l'ordinateur branché dessus), ouvrez l'adresse du site, puis appuyez sur **F** pour le plein écran.
2. Cliquez sur **Créer une partie**.
3. Les joueurs scannent le QR code (ou vont sur `…/join.html` et tapent le code à 4 lettres).
4. Le premier joueur connecté est l'**animateur** 🎙️ : il peut faire avancer le jeu depuis son téléphone. La télé le peut aussi (bouton à l'écran, touches **Espace** ou **→**).

> ⚠️ La page de la télé **est** la partie : ne la fermez pas pendant le jeu. Si elle est rechargée, la partie reprend toute seule et les téléphones se reconnectent.

## Mettre le jeu en ligne sur GitHub Pages

1. Créez un dépôt sur GitHub (par exemple `talent`) et envoyez-y le contenu de ce dossier.
2. Sur GitHub : **Settings → Pages → Build and deployment**.
   - *Source* : **Deploy from a branch**
   - *Branch* : **main**, dossier **/docs** → **Save**
3. Au bout d'une minute, le jeu est disponible à l'adresse `https://VOTRE-PSEUDO.github.io/talent/`.

## Tester sur son ordinateur (facultatif)

Avec [Node.js](https://nodejs.org) installé : double-cliquez sur `LANCER-TALENT.bat`, ou lancez `node dev-server.js`, puis ouvrez `http://localhost:3000`.

## Règles et points

| Étape | Télé | Téléphone |
|---|---|---|
| Lobby | Code, QR code, joueurs, réglages | Pseudo, avatar, titre Roi / Reine |
| Défi | Révélation de la catégorie | Rappel du défi |
| Recherche | Compte à rebours | Liens vers YouTube / Instagram, envoi du lien |
| Diffusion | Vidéos une par une, **anonymes** | 👏 😂 🎉 👎 + ⭐ SUPER BUZZER |
| Vote | Grille des vidéos | Vote (pas pour sa propre vidéo) |
| Résultats | Révélation, auteurs dévoilés | Classement et détail des points |
| Finale | Podium et couronnement | Place finale |

- 🗳️ Vote reçu : **+100**
- ⭐ Super Buzzer reçu : **+300** (1 seul par joueur et par partie, jamais sur sa propre vidéo)
- 👏😂🎉 Réaction des autres : **+5** (6 max par joueur et par vidéo) · 👎 Huée : **−5**
- 👑 Vainqueur de la manche : **+150**

Ces valeurs se règlent dans `docs/shared.js` (`POINTS`).

## Bon à savoir

- Liens acceptés : YouTube (`watch`, `youtu.be`, `shorts`) et Instagram (`reel`, `p`).
- Certaines vidéos interdisent l'intégration sur d'autres sites : elles ne s'affichent pas.
- La lecture automatique avec le son peut être bloquée par le navigateur : cliquez une fois sur la vidéo.
- Sur certains réseaux très filtrés (entreprise, école), la connexion pair-à-pair peut être bloquée.

## Aspects juridiques et vie privée

- **Indépendance** : projet non affilié à une émission de télévision, à YouTube (Google) ou à Instagram (Meta). Le bouton spécial s'appelle volontairement « Super Buzzer ».
- **Vidéos** : aucune vidéo n'est hébergée, téléchargée ou copiée. Elles sont lues uniquement via les lecteurs intégrés officiels (YouTube en mode « confidentialité renforcée »).
- **Données** : pas de compte, pas de base de données, pas de cookies du site, pas de mesure d'audience. Détails dans [`docs/about.html`](docs/about.html).
- **Tiers** : GitHub Pages (hébergement), PeerJS (mise en relation et relais), STUN Google, YouTube / Instagram au moment de la lecture. Polices et bibliothèques hébergées avec le site.
- **Éditeur** : silentrimount — contact et Instagram (@valentin.pauln) indiqués dans `docs/about.html`.

## Licences

- Code de TALENT : © silentrimount, tous droits réservés (aucune licence open source n'est accordée pour l'instant).
- Composants tiers, redistribués selon leurs licences (textes complets dans [`licenses/`](licenses/)) :
  - [PeerJS](https://github.com/peers/peerjs) — MIT
  - [QRCode.js](https://github.com/davidshimjs/qrcodejs) — MIT
  - Polices [Bungee](https://github.com/djrrb/Bungee) et [Outfit](https://github.com/Outfitio/Outfit-Fonts) — SIL Open Font License 1.1
