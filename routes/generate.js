const express = require("express");
const OpenAI = require("openai");
const axios = require("axios");
const { normalizeOpenFiscaInput } = require("../utils/openfiscaNormalizer");

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post("/", async (req, res) => {
  const debugMode = req.body.debug === true;
  try {
    const userInput = req.body.message;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Clé OpenAI manquante (OPENAI_API_KEY)" });
    }

    if (!process.env.OPENFISCA_API_URL) {
      return res.status(500).json({ error: "URL OpenFisca manquante (OPENFISCA_API_URL)" });
    }

    // Étape 1 : ChatGPT → JSON OpenFisca
    const prompt = `
Tu es un assistant social expert. À partir du texte ci-dessous, génère un objet JSON conforme à l'API OpenFisca France (https://api.fr.openfisca.org/latest/calculate) pour construire le json tu peux t'aider de la spec officiel d'openfisca via ce lien : https://api.fr.openfisca.org/latest/spec.

⚠️ Les seules entités valides sont : "individus", "menages", "foyers_fiscaux", "familles". N'utilise jamais "persons", "households", ni "families" en anglais.
Respecte strictement les noms de champs et les valeurs attendues par la spécification.

Rends uniquement le JSON brut sans texte d’explication et sans bloc markdown. Structure bien les identifiants.

Exemple officiel  de json de base envoyé a openfisca pour un couple Claude et dominique gagnant respectivement 20000€ et 30000€ annuel et ayant une fille camille qui n'a pas de revenu : 

{
  "individus": {
    "Claude": {
      "salaire_de_base": {
        "2017": 20000
      }
    },
    "Dominique": {
      "salaire_de_base": {
        "2017": 30000
      }
    },
    "Camille": {
    }
  },
  "menages": {
    "menage_1": {
      "personne_de_reference": [
        "Claude"
      ],
      "conjoint": [
        "Dominique"
      ],
      "enfants": [
        "Camille"
      ],
      "revenu_disponible": {
        "2017": null
      },
      "impots_directs": {
        "2017": null
      }
    }
  },
  "familles": {
    "famille_1": {
      "parents": [
        "Claude",
        "Dominique"
      ],
      "enfants": [
        "Camille"
      ]
    }
  },
  "foyers_fiscaux": {
    "foyer_fiscal_1": {
      "declarants": [
        "Claude",
        "Dominique"
      ],
      "personnes_a_charge": [
        "Camille"
      ]
    }
  }
}



Texte utilisateur : ${userInput}
`;


    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Tu es un assistant social intelligent qui prépare des requêtes JSON pour l'API OpenFisca."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

  let generatedJSON = aiResponse.choices[0].message.content.trim();

// 🧼 Nettoyage : suppression des balises Markdown ```json ... ```
if (generatedJSON.startsWith("```json")) {
  generatedJSON = generatedJSON.replace(/```json/, "").replace(/```$/, "").trim();
} else if (generatedJSON.startsWith("```")) {
  generatedJSON = generatedJSON.replace(/```/, "").replace(/```$/, "").trim();
}

let jsonInput;
try {
  jsonInput = JSON.parse(generatedJSON);
} catch (e) {
  return res.status(400).json({
    error: "Erreur de parsing du JSON généré par OpenAI",
    raw: generatedJSON
  });
}

    jsonInput = normalizeOpenFiscaInput(jsonInput);


    // Étape 2 : Appel OpenFisca
    let openfiscaResponse;
    try {
      openfiscaResponse = await axios.post(process.env.OPENFISCA_API_URL, jsonInput);
    } catch (e) {
      return res.status(502).json({
        error: "Erreur lors de la communication avec l'API OpenFisca",
        message: e.message,
        details: e.response?.data || null
      });
    }

    const explanationPrompt = `
Voici les résultats JSON d’une simulation OpenFisca. Reformule-les en texte clair, pour un utilisateur non expert. Résultats : ${JSON.stringify(openfiscaResponse.data)}
`;

    const finalAIResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Tu es un assistant social qui reformule les résultats d’aides sociales."
        },
        {
          role: "user",
          content: explanationPrompt
        }
      ]
    });

    const finalMessage = finalAIResponse.choices[0].message.content;

    const response = {
      result: finalMessage
    };

    if (debugMode) {
      response.debug = {
        json_envoye_a_openfisca: jsonInput,
        resultat_openfisca: openfiscaResponse.data
      };
    }

    return res.json(response);

  } catch (error) {
    console.error("Erreur générale :", error);
    return res.status(500).json({
      error: "Erreur inattendue",
      message: error.message
    });
  }
});

module.exports = router;




