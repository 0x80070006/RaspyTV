# NouTube dans RaspyTV

`noutube-content.js` est le script de page de NouTube (https://github.com/nonbili/NouTube),
version 0.6.13, compilé sans modification depuis `content/main.ts` :

    esbuild content/main.ts --bundle --minify --format=iife --target=chrome120 --alias:@=.

Il est sous licence AGPL-3.0 (voir LICENSE). RaspyTV l'exécute dans les applications
NouTube et NouTube Music via `noutube-preload.js`, avec les réglages `NOUTUBE_SETTINGS`
de `main.js` (publicités bloquées, Shorts masqués, SponsorBlock actif).

Si RaspyTV est publié, ce dossier impose de respecter l'AGPL-3.0 pour la partie concernée.
Pour mettre NouTube à jour : recompiler la nouvelle version avec la commande ci-dessus,
remplacer ce fichier, puis relancer RaspyTV.
