const axios = require("axios");
const {
  ensureVariablesMatchEntities,
  EntityValidationError,
  __testing
} = require("../utils/openfiscaEntityValidator");

jest.mock("axios");

describe("ensureVariablesMatchEntities", () => {
  beforeEach(() => {
    __testing.resetCache();
    axios.get.mockReset();
  });

  it("reclasse une variable mal catégorisée lorsque l'identifiant correspond", async () => {
    axios.get.mockResolvedValueOnce({ data: { entity: "individu" } });

    const jsonInput = {
      individus: {
        personne1: {}
      },
      menages: {
        personne1: {
          salaire_de_base: { "2024": 12000 }
        }
      }
    };

    const result = await ensureVariablesMatchEntities(jsonInput, { debugMode: false });

    expect(result.moves).toHaveLength(1);
    expect(jsonInput.menages.personne1).toEqual({});
    expect(jsonInput.individus.personne1.salaire_de_base).toEqual({ "2024": 12000 });
  });

  it("reclasse une variable vers l'unique entité disponible si l'identifiant diffère", async () => {
    axios.get.mockResolvedValueOnce({ data: { entity: "individu" } });

    const jsonInput = {
      individus: {
        jean: {}
      },
      menages: {
        menage_1: {
          age: { "2024-01": 40 }
        }
      }
    };

    const result = await ensureVariablesMatchEntities(jsonInput, { debugMode: false });

    expect(result.moves).toHaveLength(1);
    expect(jsonInput.menages.menage_1).toEqual({});
    expect(jsonInput.individus.jean.age).toEqual({ "2024-01": 40 });
  });

  it("lève une erreur en mode debug lorsqu'une variable ne peut pas être reclassée", async () => {
    axios.get.mockResolvedValue({ data: { entity: "individu" } });

    const jsonInput = {
      individus: {
        jean: {},
        claire: {}
      },
      menages: {
        menage_1: {
          age: { "2024-01": 40 }
        }
      }
    };

    await expect(
      ensureVariablesMatchEntities(jsonInput, { debugMode: true })
    ).rejects.toMatchObject({
      name: EntityValidationError.name,
      details: {
        unresolved: [
          {
            variable: "age",
            expectedSection: "individus",
            from: "menages",
            entityId: "menage_1"
          }
        ]
      }
    });
  });
});
