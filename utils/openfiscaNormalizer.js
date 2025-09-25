const MARITAL_STATUS_KEYS = [
  "situation_familiale",
  "statut_marital",
  "situation_matrimoniale",
  "statut_matrimonial"
];

const ENTITY_DEFINITIONS = {
  individus: {
    prefix: "individu",
    idCandidates: ["id", "identifiant", "identite", "nom", "name"],
    arrayFields: []
  },
  menages: {
    prefix: "menage",
    idCandidates: ["id", "identifiant"],
    arrayFields: ["personne_de_reference", "conjoint", "enfants"]
  },
  familles: {
    prefix: "famille",
    idCandidates: ["id", "identifiant"],
    arrayFields: ["parents", "enfants"]
  },
  foyers_fiscaux: {
    prefix: "foyer_fiscal",
    idCandidates: ["id", "identifiant"],
    arrayFields: ["declarants", "personnes_a_charge"]
  }
};

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

  normalizeEntities(jsonInput);

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

function normalizeEntities(jsonInput) {
  for (const [entityKey, definition] of Object.entries(ENTITY_DEFINITIONS)) {
    if (!(entityKey in jsonInput)) {
      continue;
    }

    const entityValue = jsonInput[entityKey];

    if (Array.isArray(entityValue)) {
      jsonInput[entityKey] = convertEntityArrayToObject(entityValue, definition);
    } else if (entityValue && typeof entityValue === "object") {
      // nothing to do, keep as object
    } else {
      jsonInput[entityKey] = {};
    }

    ensureArrayFields(jsonInput[entityKey], definition.arrayFields);
  }
}

function convertEntityArrayToObject(array, definition) {
  const result = {};
  let counter = 1;

  for (const item of array) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const clone = { ...item };
    const id = extractEntityId(clone, definition, counter);
    counter += 1;

    definition.idCandidates.forEach((candidate) => delete clone[candidate]);

    result[id] = clone;
  }

  return result;
}

function extractEntityId(entity, definition, counter) {
  for (const candidate of definition.idCandidates) {
    const value = entity[candidate];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return `${definition.prefix}_${counter}`;
}

function ensureArrayFields(entities, fieldNames) {
  if (!fieldNames.length) {
    return;
  }

  for (const entity of Object.values(entities)) {
    if (!entity || typeof entity !== "object") {
      continue;
    }

    for (const field of fieldNames) {
      if (!(field in entity)) {
        continue;
      }

      const value = entity[field];

      if (value == null) {
        entity[field] = [];
      } else if (Array.isArray(value)) {
        entity[field] = value.filter((item) => item != null && item !== "");
      } else {
        entity[field] = [value];
      }
    }
  }
}

module.exports = {
  normalizeOpenFiscaInput
};
