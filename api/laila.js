// api/laila.js
import OpenAI from "openai";
import { ARCHIVE_CHUNKS } from "../data/build-context.js";
import { ARCHIVE_PAGES } from "../data/archive-pages.js";

export default async function handler(req, res) {
  // CORS (لو موقعك على دومين مختلف عن الـ backend)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // غيره من Vercel لو تحب

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "LAILA AI is running. Send POST { question, lang?, level?, era?, mode? }",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const questionRaw = (body.question || "").toString().trim();
    const lang = (body.lang || "auto").toString();   // "ar" | "en" | "auto"
    const level = (body.level || "auto").toString(); // "beginner" | "advanced" | "auto"
    const era = (body.era || "auto").toString();     // "modern" | "classic" | "auto"
    const mode = (body.mode || "hybrid").toString(); // "archive" | "general" | "hybrid"

    if (!questionRaw) {
      return res.status(400).json({ ok: false, error: "Missing 'question'." });
    }

    // 1) Search in archive (lexical scoring + bilingual normalization)
    const query = normalizeText(questionRaw);
    const hits = searchArchive(query, ARCHIVE_CHUNKS, 6);

    const bestScore = hits[0]?.score || 0;
    const archiveStrong = bestScore >= 0.22; // عدّل العتبة حسب أرشيفك (0.18–0.28 غالبًا)

    // build “related links” حتى لو الإجابة عامة
    const relatedLinks = buildRelatedLinks(hits, ARCHIVE_PAGES, 5);

    // 2) Decide route
    const useArchive =
      mode === "archive" ? true :
      mode === "general" ? false :
      archiveStrong;

    // 3) Compose prompt
    const systemPrompt = SYSTEM_PROMPT;

    const archiveContext = useArchive
      ? hits.map(h => `- [${h.meta.title || "Archive"}] (${h.meta.url || ""})\n${h.text}`).join("\n\n")
      : "";

    const userPrompt = buildUserPrompt({
      questionRaw,
      lang,
      level,
      era,
      useArchive,
      archiveContext,
      relatedLinks,
    });

    // 4) Call model (Responses API style via SDK)
    const response = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      // نخليها نص JSON واضح (بدون تعقيد structured outputs)
      temperature: useArchive ? 0.2 : 0.5,
      max_output_tokens: 800,
    });

    const text = extractText(response);
    const data = safeJsonParse(text) || {
      mode: useArchive ? "archive" : "general",
      answer_ar: "",
      answer_en: "",
      confidence: useArchive ? 0.6 : 0.45,
      meta: { year: null, level: level === "auto" ? null : level, era: era === "auto" ? null : era },
      sources: [],
      related: relatedLinks,
      notes: "Model returned non-JSON; fallback object used."
    };

    // 5) Ensure fields
    data.ok = true;
    if (!data.related) data.related = relatedLinks;
    if (!data.mode) data.mode = useArchive ? "archive" : "general";

    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: (err && err.message) ? err.message : String(err),
    });
  }
}

/* ------------------------- PROMPT ------------------------- */

const SYSTEM_PROMPT = `
You are LAILA, an expert assistant for Rhythmic Gymnastics.
You MUST follow this policy:

1) If ARCHIVE_CONTEXT is provided and relevant, answer primarily from it.
   - Use it to produce a precise answer.
   - Provide sources as clickable links if URLs exist.
   - Mention year and level if inferable from context.

2) If ARCHIVE_CONTEXT is empty or not relevant, provide a GENERAL answer using your best knowledge.
   - Clearly label it as "General answer (not sourced from the archive)".
   - Keep it practical, structured, and safe.
   - Offer short guidance and, if possible, suggest related archive links from the provided RELATED section.

Output MUST be valid JSON ONLY, no markdown, no extra text.

JSON schema:
{
  "mode": "archive" | "general",
  "answer_ar": "Arabic answer",
  "answer_en": "English answer",
  "confidence": 0..1,
  "meta": {
    "year": number|null,
    "level": "beginner"|"advanced"|null,
    "era": "classic"|"modern"|null,
    "topic": "Judging|Apparatus|Training|History|Gymnasts|Rules|Other"
  },
  "sources": [
    { "title": "...", "url": "...", "year": number|null }
  ],
  "related": [
    { "title": "...", "url": "..." }
  ],
  "notes": "optional"
}

Notes:
- Provide BOTH Arabic and English answers every time.
- If the user asks about a person (gymnast), give a concise bio + key achievements if known.
- For judging questions, present clear bullet points and terminology.
`;

/* ------------------------- HELPERS ------------------------- */

function buildUserPrompt({ questionRaw, lang, level, era, useArchive, archiveContext, relatedLinks }) {
  const related = (relatedLinks || []).map(x => `- ${x.title}: ${x.url}`).join("\n");
  return `
USER_QUESTION: ${questionRaw}
LANG_PREF: ${lang}
LEVEL_PREF: ${level}
ERA_PREF: ${era}

USE_ARCHIVE: ${useArchive ? "YES" : "NO"}

ARCHIVE_CONTEXT:
${useArchive ? archiveContext : "(none)"}

RELATED (links you may suggest if useful):
${related || "(none)"}

Return JSON only.`;
}

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchArchive(query, chunks, k = 5) {
  if (!query || !chunks?.length) return [];
  const qTokens = new Set(expandSynonyms(query).split(" ").filter(Boolean));

  const scored = chunks.map((c) => {
    const t = normalizeText(c.text || "");
    const tTokens = new Set(t.split(" ").filter(Boolean));
    let hit = 0;
    for (const tok of qTokens) if (tTokens.has(tok)) hit++;
    const score = hit / Math.max(6, qTokens.size); // normalize
    return { score, text: c.text, meta: c.meta || {} };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).filter(x => x.score > 0);
}

// مرادفات بسيطة (كبرها مع الوقت)
function expandSynonyms(q) {
  const map = [
    ["d score", "difficulty score d value"],
    ["e score", "execution score artistry penalties"],
    ["dv", "difficulty value dscore"],
    ["apparatus", "rope hoop ball clubs ribbon"],
    ["ribbon", "شريط"],
    ["hoop", "طوق"],
    ["ball", "كرة"],
    ["clubs", "صولجان"],
    ["rope", "حبل"],
    ["judging", "تحكيم قضاة خصومات"],
    ["penalty", "خصم عقوبة"],
    ["routine", "جملة"],
    ["body difficulties", "صعوبات الجسم leaps jumps pivots balances"],
    ["pivot", "لفة دوران pivot"],
    ["balance", "توازن"],
    ["leap", "وثبة قفزة leap"],
  ];

  let out = q;
  for (const [a, b] of map) {
    if (out.includes(a)) out += " " + b;
    if (out.includes(b)) out += " " + a;
  }
  return out;
}

function buildRelatedLinks(hits, pages, n = 5) {
  const urls = new Set();
  const out = [];

  for (const h of (hits || [])) {
    if (h.meta?.url && !urls.has(h.meta.url)) {
      urls.add(h.meta.url);
      out.push({ title: h.meta.title || "Archive", url: h.meta.url });
    }
    if (out.length >= n) break;
  }

  // fallback: add a few fixed pages
  if (out.length < n && Array.isArray(pages)) {
    for (const p of pages) {
      if (p?.url && !urls.has(p.url)) {
        urls.add(p.url);
        out.push({ title: p.title || "Archive", url: p.url });
      }
      if (out.length >= n) break;
    }
  }

  return out;
}

function extractText(resp) {
  try {
    // SDK returns output text in a helper, but we’ll do safe extraction
    if (typeof resp.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();
    // fallback: dig
    const out = resp.output?.[0]?.content?.[0]?.text;
    if (typeof out === "string") return out.trim();
  } catch {}
  return "";
}

function safeJsonParse(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // محاولة تقصّ أي نص زائد قبل/بعد JSON (احتياط)
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}
