import OpenAI from "openai";
import archiveContext from "../data/archive-context.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.json({
      message: "LAILA AI is running. Send a POST request with { question }",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question, lang } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const systemPrompt = `
You are LAILA, an AI assistant specialized ONLY in Rhythmic Gymnastics.

Rules:
- Answer ONLY questions related to rhythmic gymnastics.
- Use the archive context below as your main source.
- If the question is unclear, ask for clarification.
- If the question is outside rhythmic gymnastics, politely say so.
- Default language: Arabic.
- If lang = "en", answer in English.
- Be clear, educational, and friendly.
- Avoid saying "I don't know" unless information truly does not exist.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: archiveContext },
        { role: "user", content: question },
      ],
      temperature: 0.3,
    });

    const answer = completion.choices[0].message.content;

    res.status(200).json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI processing error" });
  }
}
