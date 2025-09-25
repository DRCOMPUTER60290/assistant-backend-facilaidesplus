const express = require("express");
const OpenAI = require("openai");
const axios = require("axios");

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
Tu es un assistant social expert. À partir de ce texte utilisateur, génère un objet JSON conforme à l'API OpenFisca (https://api.fr.openfisca.org/latest/calculate). Ne donne que le JSON, sans explication. Texte utilisateur : ${userInput}
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

    const generatedJSON = aiResponse.choices[0].message.content;

    let jsonInput;
    try {
      jsonInput = JSON.parse(generatedJSON);
    } catch (e) {
      return res.status(400).json({
        error: "Erreur de parsing du JSON généré par OpenAI",
        raw: generatedJSON
      });
    }

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
