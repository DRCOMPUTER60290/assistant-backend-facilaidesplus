const axios = require("axios");

const VARIABLE_METADATA_BASE_URL = "https://api.fr.openfisca.org/latest/variables";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const entityKeyMap = {
  individu: "individus",
  individus: "individus",
  person: "individus",
  personne: "individus",
  menage: "menages",
  menages: "menages",
  foyer_fiscal: "foyers_fiscaux",
  foyers_fiscaux: "foyers_fiscaux",
  famille: "familles",
  familles: "familles"
};

const variableMetadataCache = new Map();
let cachedVariableIndex = null;
let variableIndexTimestamp = 0;

function normalizeEntityKey(entity) {
  if (!entity) {
    return undefined;
  }
  const normalized = entity.toLowerCase();
  return entityKeyMap[normalized];
}

function isCacheEntryValid(entry) {
  if (!entry) {
    return false;
  }
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

async function fetchVariableMetadataFromApi(variable) {
  try {
    const response = await axios.get(
      `${VARIABLE_METADATA_BASE_URL}/${encodeURIComponent(variable)}`,
      {
        headers: { Accept: "application/json" }
      }
    );
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchVariableIndexFromApi() {
  const response = await axios.get(VARIABLE_METADATA_BASE_URL, {
    headers: { Accept: "application/json" }
  });
  return response.data;
}

async function getVariableMetadata(variable) {
  const cachedEntry = variableMetadataCache.get(variable);
  if (isCacheEntryValid(cachedEntry)) {
    return cachedEntry.data;
  }

  const metadata = await fetchVariableMetadataFromApi(variable);

  if (metadata) {
    variableMetadataCache.set(variable, {
      data: metadata,
      timestamp: Date.now()
    });
    return metadata;
  }

  if (!cachedVariableIndex || Date.now() - variableIndexTimestamp >= CACHE_TTL_MS) {
    const index = await fetchVariableIndexFromApi();
    cachedVariableIndex = index;
    variableIndexTimestamp = Date.now();
    Object.entries(index || {}).forEach(([variableName, data]) => {
      variableMetadataCache.set(variableName, {
        data,
        timestamp: Date.now()
      });
    });
  }

  const indexedMetadata = cachedVariableIndex ? cachedVariableIndex[variable] : undefined;
  if (indexedMetadata) {
    variableMetadataCache.set(variable, {
      data: indexedMetadata,
      timestamp: Date.now()
    });
  }
  return indexedMetadata;
}

class EntityValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "EntityValidationError";
    this.details = details;
  }
}

function ensureContainerObject(container) {
  if (!container || typeof container !== "object" || Array.isArray(container)) {
    return {};
  }
  return container;
}

function findTargetEntityId(targetContainer, preferredId) {
  if (!targetContainer || typeof targetContainer !== "object") {
    return null;
  }
  if (preferredId && Object.prototype.hasOwnProperty.call(targetContainer, preferredId)) {
    return preferredId;
  }
  const candidateIds = Object.keys(targetContainer);
  if (candidateIds.length === 1) {
    return candidateIds[0];
  }
  return null;
}

async function ensureVariablesMatchEntities(jsonInput, options = {}) {
  const { debugMode = false } = options;
  if (!jsonInput || typeof jsonInput !== "object") {
    return { moves: [], unresolved: [] };
  }

  const entitySections = ["individus", "menages", "familles", "foyers_fiscaux"];
  const moves = [];
  const unresolved = [];
  const fetchErrors = [];

  for (const section of entitySections) {
    const sectionContent = ensureContainerObject(jsonInput[section]);
    for (const [entityId, variables] of Object.entries(sectionContent)) {
      if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
        continue;
      }
      for (const [variableName, value] of Object.entries({ ...variables })) {
        if (value === undefined) {
          continue;
        }

        let metadata;
        try {
          metadata = await getVariableMetadata(variableName);
        } catch (error) {
          fetchErrors.push({
            variable: variableName,
            error: error.message
          });
          continue;
        }

        if (!metadata || !metadata.entity) {
          continue;
        }
        const expectedSection = normalizeEntityKey(metadata.entity);
        if (!expectedSection || expectedSection === section) {
          continue;
        }

        const targetContainer = ensureContainerObject(jsonInput[expectedSection]);
        const targetEntityId = findTargetEntityId(targetContainer, entityId);

        if (targetEntityId) {
          if (!jsonInput[expectedSection]) {
            jsonInput[expectedSection] = {};
          }
          if (!jsonInput[expectedSection][targetEntityId] || typeof jsonInput[expectedSection][targetEntityId] !== "object") {
            jsonInput[expectedSection][targetEntityId] = {};
          }

          jsonInput[expectedSection][targetEntityId][variableName] = value;
          delete variables[variableName];
          moves.push({
            variable: variableName,
            from: section,
            to: expectedSection,
            originalEntityId: entityId,
            targetEntityId
          });
        } else {
          unresolved.push({
            variable: variableName,
            expectedSection,
            from: section,
            entityId
          });
        }
      }
    }
  }

  if (fetchErrors.length > 0 && debugMode) {
    throw new EntityValidationError(
      "Impossible de récupérer les métadonnées de certaines variables.",
      { fetchErrors }
    );
  }

  if (unresolved.length > 0 && debugMode) {
    throw new EntityValidationError(
      "Certaines variables ne correspondent pas à l'entité attendue.",
      { unresolved }
    );
  }

  return { moves, unresolved };
}

function resetCache() {
  variableMetadataCache.clear();
  cachedVariableIndex = null;
  variableIndexTimestamp = 0;
}

module.exports = {
  ensureVariablesMatchEntities,
  EntityValidationError,
  __testing: {
    resetCache,
    getVariableMetadata,
    normalizeEntityKey,
    findTargetEntityId
  }
};
