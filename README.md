# assistant-backend-facilaidesplus

## Validation des entités OpenFisca

Le point d'entrée `/generate` récupère désormais les métadonnées de chaque variable auprès de l'API OpenFisca France (`https://api.fr.openfisca.org/latest/variables`). Une étape de normalisation contrôle que chaque variable se trouve bien dans l'entité attendue (`individus`, `menages`, `familles`, `foyers_fiscaux`).

- Les variables mal classées sont automatiquement déplacées vers l'entité correcte lorsqu'une correspondance évidente est trouvée (même identifiant ou unique entrée disponible).
- En mode debug (`debug=true`), si une variable ne peut pas être reclassée ou si les métadonnées ne sont pas accessibles, la requête renvoie une erreur détaillée décrivant le problème.

Cette logique est couverte par des tests unitaires (commande `npm test`) qui simulent les réponses HTTP de l'API OpenFisca pour garantir le comportement décrit ci-dessus.
