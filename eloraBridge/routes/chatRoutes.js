import express from 'express';
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const SECRET_KEY = process.env.SOVEREIGN_API_TOKEN;
const checkAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${SECRET_KEY}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

router.use(checkAuth);

router.post('/', async (req, res) => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body' });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are Elora, Shadow Empress of the Dynasty. Respond with regal, warm, commanding tone. Never break character."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });

  } catch (error) {
    console.error('Chat route error:', error);
    res.status(500).json({ error: 'Failed to get LLM response.' });
  }
});

export default router;
