const express = require("express");
const OpenAI = require("openai");
const axios = require("axios");
const { normalizeOpenFiscaInput } = require("../utils/openfiscaNormalizer");

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const currentYear = new Date().getFullYear();

router.post("/", async (req, res) => {
  const debugFlag = req.body.debug;
  const debugMode = debugFlag === true || debugFlag === "true";
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
Tu es un assistant social expert. À partir du texte utilisateur ci-dessous, génère un objet JSON STRICTEMENT conforme à l'API OpenFisca France (https://api.fr.openfisca.org/latest/calculate). 
Tu peux t'appuyer sur la spec officielle : https://api.fr.openfisca.org/latest/spec.

⚠️ Règles impératives :
- Les seules entités valides sont : "individus", "menages", "foyers_fiscaux", "familles".
- N'utilise jamais "persons", "households", "families" en anglais.
- Respecte exactement les noms de variables OpenFisca (ex: "salaire_de_base", "age", "indemnite_chomage_brut", "handicap").
- L'année de référence pour toutes les variables est ${currentYear}.
- Rends uniquement le JSON brut sans texte d’explication, sans commentaires, et sans balises markdown.
- Structure toujours : "individus", "menages", "familles", "foyers_fiscaux". Même si certains sont vides.

📌 Règles de construction :
- Chaque individu doit avoir un identifiant unique clair (ex: "parent1", "conjoint1", "enfant1").
- Inclure "age" pour chaque individu si possible.
- Si un revenu est mentionné mensuellement → convertir en revenu annuel.
- Si un enfant a 16 ans ou plus et mentionne un revenu → ajouter "salaire_de_base".
- Les couples doivent apparaître comme "personne_de_reference" + "conjoint" dans "menages", et "parents" dans "familles".
- Les célibataires apparaissent comme seule "personne_de_reference".
- Toujours créer un foyer fiscal avec au moins les déclarants.

Exemple valide de base :

{
  "individus": {
    "Claude": {
      "salaire_de_base": { "${currentYear}": 20000 },
      "age": { "${currentYear}": 40 }
    },
    "Dominique": {
      "salaire_de_base": { "${currentYear}": 30000 },
      "age": { "${currentYear}": 38 }
    },
    "Camille": {
      "age": { "${currentYear}": 10 }
    }
  },
  "menages": {
    "menage_1": {
      "personne_de_reference": ["Claude"],
      "conjoint": ["Dominique"],
      "enfants": ["Camille"],
      "revenu_disponible": { "${currentYear}": null },
      "impots_directs": { "${currentYear}": null }
    }
  },
  "familles": {
    "famille_1": {
      "parents": ["Claude", "Dominique"],
      "enfants": ["Camille"]
    }
  },
  "foyers_fiscaux": {
    "foyer_fiscal_1": {
      "declarants": ["Claude", "Dominique"],
      "personnes_a_charge": ["Camille"]
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
Nous sommes en ${currentYear}. Voici les résultats JSON d’une simulation OpenFisca. Reformule-les en texte clair pour un utilisateur non expert en gardant cette année de référence. Résultats : ${JSON.stringify(openfiscaResponse.data)}
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





