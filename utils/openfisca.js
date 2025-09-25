function buildOpenFiscaJSON(data) {
  // Exemple : tu peux l'utiliser si tu veux structurer le JSON toi-même
  return {
    individus: {
      Claude: {
        salaire_de_base: { "2024": data.salaireClaude },
        age: data.ageClaude
      },
      Dominique: {
        salaire_de_base: { "2024": data.salaireDominique },
        age: data.ageDominique
      }
    },
    foyers_fiscaux: {
      foyer_fiscal_1: {
        declarants: ["Claude", "Dominique"]
      }
    },
    menages: {
      menage_1: {
        personne_de_reference: ["Claude"],
        conjoint: ["Dominique"]
      }
    }
  };
}

module.exports = buildOpenFiscaJSON;
