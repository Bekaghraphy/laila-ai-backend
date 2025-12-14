import fetch from "node-fetch";

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.json({
      message: "LAILA AI is running. Send a POST request with { question }",
    });
  }

  try {
    const { question, lang = "ar", context = "" } = req.body;

    if (!question) {
      return res.status(400).json({ error: "No question provided" });
    }

    const systemPrompt =
      lang === "ar"
        ? `أنت مساعد متخصص في الجمباز الإيقاعي. أجب بدقة وبأسلوب واضح اعتمادًا على الأرشيف التالي:\n${context}`
        : `You are a rhythmic gymnastics expert. Answer clearly based on this archive:\n${context}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();

    return res.json({
      answer: data.choices?.[0]?.message?.content || "No answer",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "AI request failed",
    });
  }
}
