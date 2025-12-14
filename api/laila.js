import OpenAI from "openai";
import { archiveContext } from "../data/archive-context.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question, lang } = req.body;

  const prompt = `
You are LAILA, an AI assistant specialized ONLY in rhythmic gymnastics.

ARCHIVE CONTENT:
${archiveContext}

RULES:
- Answer only from the archive content.
- If the answer is not available, say so clearly.
- Answer in ${lang}.
- Keep the answer concise and clear.

QUESTION:
${question}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    res.json({ answer: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: "AI error" });
  }
}
