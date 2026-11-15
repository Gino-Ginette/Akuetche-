# Mon Budget

Application web personnelle (PWA) pour suivre et planifier son budget mensuel en FCFA.

- Entrées, dépenses planifiées et reste disponible, mois par mois.
- Planification à l'avance : on prépare décembre dès novembre.
- Une dépense cochée est déduite immédiatement du reste disponible ; le montant réellement payé peut être ajusté.
- Dépenses imprévues, copie du plan du mois précédent, report du reste.
- Alertes : seuil de dépenses réglable, plafond mensuel, catégorie dépassée, mois plus dépensier que d'habitude.
- Tableau de bord : courbe des dépenses sur l'année choisie avec le pic, et répartition par catégorie.
- Fonctionne hors connexion. Les données restent sur le téléphone (stockage local du navigateur) ; le menu ⋮ permet d'exporter et d'importer une sauvegarde.

## Installation sur Android

1. Publier le dépôt avec GitHub Pages (Settings → Pages → choisir la branche, dossier `/root`).
2. Ouvrir l'adresse obtenue dans Chrome sur le téléphone.
3. Menu de Chrome → « Ajouter à l'écran d'accueil » / « Installer l'application ».

## Essai en local

```
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000.

Aucune dépendance ni étape de compilation : HTML, CSS et JavaScript simples.
