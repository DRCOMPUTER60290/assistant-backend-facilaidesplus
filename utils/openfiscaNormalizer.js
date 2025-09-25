const MARITAL_STATUS_KEYS = [
  "situation_familiale",
  "statut_marital",
  "situation_matrimoniale",
  "statut_matrimonial"
];

const MARITAL_STATUS_MAP = (() => {
  const groups = {
    celibataire: ["celibataire", "célibataire", "single", "seul"],
    marie: ["marie", "marié", "mariee", "mariée", "married"],
    pacse: ["pacse", "pacsé", "pacsée", "pacs"],
    concubinage: ["concubinage", "concubine", "unionlibre", "union libre", "vie maritale"],
    divorce: ["divorce", "divorcé", "divorcee", "divorcée"],
    veuf: ["veuf", "veuve", "widow", "widower", "veu", "veuvee"],
    separe: ["separe", "séparé", "separee", "séparée", "separation", "séparation"]
  };

  const map = new Map();

  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");

  for (const [canonical, variants] of Object.entries(groups)) {
    map.set(normalize(canonical), canonical);
    variants.forEach((variant) => map.set(normalize(variant), canonical));
  }

  return {
    normalize,
    getCanonical(value) {
      if (typeof value !== "string") {
        return value;
      }
      const normalized = normalize(value);
      return map.get(normalized) || value;
    }
  };
})();

function normalizeMaritalStatusContainer(container) {
  if (!container || typeof container !== "object") {
    return;
  }

  for (const key of MARITAL_STATUS_KEYS) {
    if (key in container) {
      const value = container[key];
      const canonicalKey = "situation_familiale";

      if (key !== canonicalKey) {
        container[canonicalKey] = container[canonicalKey] ?? value;
        delete container[key];
      }

      if (container[canonicalKey] && typeof container[canonicalKey] === "object" && !Array.isArray(container[canonicalKey])) {
        for (const period of Object.keys(container[canonicalKey])) {
          container[canonicalKey][period] = MARITAL_STATUS_MAP.getCanonical(container[canonicalKey][period]);
        }
      } else if (typeof container[canonicalKey] === "string") {
        container[canonicalKey] = MARITAL_STATUS_MAP.getCanonical(container[canonicalKey]);
      }

      // On normalise uniquement la première clé trouvée
      break;
    }
  }
}

function normalizeOpenFiscaInput(jsonInput) {
  if (!jsonInput || typeof jsonInput !== "object") {
    return jsonInput;
  }

  const individus = jsonInput.individus;
  if (individus && typeof individus === "object" && !Array.isArray(individus)) {
    for (const individu of Object.values(individus)) {
      if (individu && typeof individu === "object") {
        normalizeMaritalStatusContainer(individu);
      }
    }
  }

  return jsonInput;
}

module.exports = {
  normalizeOpenFiscaInput
};
