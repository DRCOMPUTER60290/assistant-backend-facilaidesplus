const express = require("express");
const OpenAI = require("openai"); // ✅ nouvelle importation
const axios = require("axios");
const buildOpenFiscaJSON = require("../utils/openfisca");

const router = express.Router();

// ✅ Configuration OpenAI pour version 4.x
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post("/", async (req, res) => {
  try {
    const userInput = req.body.message;

    // Étape 1 : demander à ChatGPT de générer le JSON OpenFisca
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

    const jsonInput = JSON.parse(aiResponse.choices[0].message.content);

    // Étape 2 : envoyer à OpenFisca
    const openfiscaResponse = await axios.post(process.env.OPENFISCA_API_URL, jsonInput);

    // Étape 3 : demander à GPT de reformuler les résultats
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
    res.json({ result: finalMessage });

  } catch (error) {
    console.error("Erreur de génération :", error);
    res.status(500).json({ error: "Erreur lors du traitement de la demande." });
  }
});

module.exports = router;


module.exports = router;

