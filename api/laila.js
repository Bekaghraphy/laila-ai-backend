// api/laila.js
import OpenAI from "openai";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "LAILA AI is running. Send POST { question }",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const question = (body?.question || "").trim();

    if (!question) {
      return res.status(400).json({ ok: false, error: "Missing question" });
    }

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.4,
      max_output_tokens: 700,
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    return res.status(200).json({
      ok: true,
      mode: "general",
      answer_ar: extractArabic(text),
      answer_en: extractEnglish(text),
      confidence: 0.4,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: err.message,
    });
  }
}

const SYSTEM_PROMPT = `
You are LAILA, an expert AI assistant specialized in Rhythmic Gymnastics.

You answer questions about:
- Judging
- Training
- Apparatus
- History
- Gymnasts
- Rules

Rules:
- Always provide BOTH Arabic and English answers.
- If the question is unclear, give a helpful general explanation.
- Keep answers structured and practical.
- Do NOT mention archives or sources.
`;

function extractArabic(text) {
  return text;
}

function extractEnglish(text) {
  return text;
}
