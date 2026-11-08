# VLT Profiles

Une interface inspirée de VALORANT pour enregistrer et transférer les préférences synchronisées entre vos comptes Riot.

**Site : https://vlt-profiles-mahkalix.vercel.app**

## Utilisation

1. Téléchargez le connecteur Windows depuis le site et extrayez le ZIP.
2. Installez Node.js 22+ et PowerShell 7 si nécessaire, puis lancez `Demarrer.cmd`.
3. Le connecteur ouvre une copie locale de l'interface avec une association temporaire pour cet onglet. Ce mode évite l'autorisation d'accès au réseau local depuis HTTPS.
4. Connectez le compte source dans Riot Client, actualisez sur le site et créez un profil.
5. Connectez le compte destination, fermez VALORANT, actualisez et appliquez le profil.

Le navigateur affiche la destination et demande confirmation avant remplacement. Une sauvegarde est créée avant chaque transfert, y compris avant une restauration. La restauration doit cibler le compte propriétaire de la sauvegarde.

## Conservation et confidentialité

Les profils et sauvegardes résident dans `%LOCALAPPDATA%\VLTProfiles`, indépendamment du ZIP ou du dossier source. Ils ne sont pas effacés à la fermeture du connecteur. Sauvegardez ce dossier sur un autre support pour éviter une perte en cas de panne ou réinstallation de Windows.

Les préférences appliquées sont enregistrées chez Riot. Vous pouvez ensuite fermer le connecteur. Vos modifications ultérieures dans le jeu ne changent pas les profils déjà sauvegardés.

Le connecteur conserve les jetons Riot en mémoire, sans les renvoyer au navigateur ou à Vercel. Il n'écoute que sur `127.0.0.1`, vérifie l'origine exacte du site, le nom d'hôte et un secret d'association aléatoire. Ce secret est transmis dans le fragment de l'URL (pas au serveur web), retiré de l'adresse et conservé dans la session de l'onglet. Relancez le connecteur pour créer une nouvelle association. Les profils ne sont pas hébergés sur Vercel.

## Fonctionnement

Le site statique communique directement avec le compagnon Windows. Le compagnon sert aussi la même interface en local (mode ouvert par défaut), pour les navigateurs qui bloquent les connexions depuis HTTPS vers le PC. Celui-ci utilise la session Riot Client et l'API privée `Ares.PlayerSettings`. Il sauvegarde le bloc de préférences encodé sans supprimer les paramètres inconnus, puis vérifie sa relecture après un transfert.

Le transfert concerne les préférences synchronisées présentes dans ce bloc. Les réglages uniquement locaux ou liés au matériel ne sont pas garantis. Il ne transfère ni compte, ni progression, ni objets. L'API privée peut évoluer et rendre la méthode indisponible. Ce projet n'est ni affilié ni approuvé par Riot Games.

La méthode a été validée sur les comptes du créateur. La compatibilité sur d'autres machines et navigateurs reste à vérifier, notamment l'autorisation d'accès au réseau local depuis HTTPS.

## Développement

```sh
npm install
npm test
npm run test:engine
npm run build
```

Le dossier `public` est l'interface Vercel. `connector` contient le serveur local Node.js sans dépendance et les fonctions PowerShell. La valeur `SITE` dans `connector/server.mjs` doit correspondre exactement à votre domaine de production si vous hébergez une copie.

Le ZIP `public/downloads/vlt-connector.zip` doit être régénéré après une modification du connecteur (PowerShell : `Compress-Archive -Path connector/* -DestinationPath public/downloads/vlt-connector.zip -Force`). Aucun profil personnel, alias ou jeton ne doit y être ajouté.

## Origine de la méthode

L'approche de transfert par le service de préférences Riot a été vérifiée dans le code public de [ValoUtils](https://github.com/windowsedd/ValoUtils/blob/master/src-tauri/src/riot/settings.rs). Ce projet utilise une interface et un connecteur distincts.

La direction graphique s'inspire du [site officiel VALORANT](https://playvalorant.com/fr-fr/). Le bandeau utilise une vidéo diffusée par le CDN officiel de Riot. Les éléments VALORANT appartiennent à leurs ayants droit.

## Artwork attribution

Artwork in `public/assets/riot` comes from Riot Games' official VALORANT Public Content Catalog (release 08.09). See `provenance.json` for the original archive entries and source links. Copyright remains with Riot Games, Inc.; these assets are not public domain or CC0. Riot usage policies apply. The VLT Profiles logo remains original. The catalog does not constitute approval of this application's private API integration.
