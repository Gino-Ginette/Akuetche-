# Mon Budget

Application web personnelle (PWA) pour suivre et planifier son budget mensuel en FCFA.

- **Planifier** : un montant par catégorie pour le mois (alimentation, transport, cotisation…), préparé à l'avance si l'on veut.
- **Dépenses** : enregistrées jour par jour ; chaque dépense est déduite de sa catégorie dans le plan et du solde du mois.
- **Accueil** : solde disponible, entrées et suivi du plan (dépensé / planifié, reste par catégorie).
- Copie du plan du mois précédent, report du reste, catégories personnelles avec icône.
- **Créances** : argent prêté, échéance convenue, remboursements partiels ou complets, totaux prêté / remboursé / restant dû, rappel des retards.
- **Dettes** : ce que je dois, échéance, motif, paiements par tranche ; chaque paiement peut être déduit du solde du mois.
- Conseils personnalisés à partir des chiffres du mois.
- Alertes : première alerte dès 50 % des entrées dépensées, seuil de dépenses réglable, plafond mensuel, catégorie presque épuisée ou dépassée, mois plus dépensier que d'habitude.
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
