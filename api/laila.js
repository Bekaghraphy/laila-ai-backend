export default async function handler(req, res) {

  // ===== CORS (مهم جدًا) =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ===== باقي الكود =====

import OpenAI from "openai";
import { archiveContext } from "../data/archive-context.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      message: "LAILA AI is running. Send a POST request with { question }",
    });
  }

  try {
    const { question, lang } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const systemPrompt = `
You are LAILA, an expert AI assistant specialized in Rhythmic Gymnastics.
Use the following archive as your knowledge base.

Archive:
${archiveContext}

Rules:
- Answer clearly and concisely.
- If the question is outside rhythmic gymnastics, say you don't know.
- Respond in Arabic if lang = "ar", otherwise English.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.4,
    });

    res.status(200).json({
      answer: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("LAILA API ERROR:", error);
    res.status(500).json({
      error: "AI processing failed",
      details: error.message,
    });
  }
}
