// api/laila.js
import { buildArchiveContext } from "../data/build-context.js";
import OpenAI from "openai";
import archiveContext from "../data/archive-context.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// روابط الأرشيف داخل موقعك (Front-end)
const ARCHIVE_LINKS = {
  history: { url: "history.html", ar: "تاريخ اللعبة", en: "History of the Sport" },
  apparatus: { url: "apparatus.html", ar: "دليل الأدوات", en: "Apparatus Guide" },
  rules: { url: "rules.html", ar: "تطور القوانين", en: "Evolution of Rules" },
  judging: { url: "judging.html", ar: "التحكيم", en: "Judging System" },
  training: { url: "training.html", ar: "التدريب", en: "Training" },
  gymnasts: { url: "gymnasts.html", ar: "لاعبات مؤثرات", en: "Famous Gymnasts" },
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // لو عايز تقفلها بعدين: حط دومينك بدل *
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function mapTopicsToLinks(topics = []) {
  const out = [];
  const set = new Set();
  topics.forEach((t) => {
    const key = String(t || "").toLowerCase().trim();
    if (ARCHIVE_LINKS[key] && !set.has(key)) {
      set.add(key);
      out.push({
        title_ar: ARCHIVE_LINKS[key].ar,
        title_en: ARCHIVE_LINKS[key].en,
        url: ARCHIVE_LINKS[key].url,
      });
    }
  });
  return out;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.json({
      message: "LAILA AI is running. Send POST { question, lang }",
      example: { question: "اشرح نظام التحكيم D/E/A", lang: "ar" },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, lang } = req.body || {};
  if (!question || String(question).trim().length < 2) {
    return res.status(400).json({ error: "Question is required" });
  }

  const preferredLang = (lang === "en") ? "en" : "ar";

  const systemPrompt = `
You are LAILA, an AI assistant specialized ONLY in Rhythmic Gymnastics (RG).

Output MUST be a valid JSON object with this schema:
{
  "answer_ar": "string",
  "answer_en": "string",
  "level": "beginner|intermediate|advanced",
  "year_or_era": "string",
  "sources": ["string", "..."],
  "topics": ["history|apparatus|rules|judging|training|gymnasts"]
}

Rules:
- Use the provided archive context as your primary reference.
- You may use general RG knowledge if consistent and safe; avoid inventing precise facts.
- If the question is unclear, ask a short clarifying question inside answer_ar and answer_en.
- If outside RG, politely refuse inside both answers.
- Keep answers concise but useful: 6–14 lines, include bullets when helpful.
- "sources" must be INTERNAL archive references like:
  "LAILA Archive: Judging System", "LAILA Archive: Apparatus Guide", etc.
- "year_or_era" can be an era label (e.g., "1980s era", "Modern Code era") if no exact year.
- "topics" must be from the allowed list only.
`;

  const userPrompt = `
Preferred output language on UI: ${preferredLang}.
User question:
${question}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: archiveContext },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.25,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        answer_ar: "حصل خطأ في تنسيق الرد. جرّب تاني بصياغة مختلفة.",
        answer_en: "Response formatting error. Please retry with a clearer question.",
        level: "beginner",
        year_or_era: "Modern era",
        sources: ["LAILA Archive: General Overview"],
        topics: [],
      };
    }

    const archive_links = mapTopicsToLinks(data.topics || []);

    return res.status(200).json({
      answer_ar: data.answer_ar || "",
      answer_en: data.answer_en || "",
      level: data.level || "beginner",
      year_or_era: data.year_or_era || "Modern era",
      sources: Array.isArray(data.sources) ? data.sources.slice(0, 6) : ["LAILA Archive"],
      topics: Array.isArray(data.topics) ? data.topics.slice(0, 6) : [],
      archive_links,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "AI processing error" });
  }
}
