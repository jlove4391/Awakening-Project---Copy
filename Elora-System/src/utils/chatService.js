import personaPrompts from '../personas/personaPrompt';
import { logBus, logEvent } from './logBus';
import axios from 'axios';
import { storeToken, getStoredToken, refreshToken } from './tokenManager';

/** STATIC COMPLETION HANDLER **/
export async function getChatResponse(prompt, personaName = 'Zyvra', memory = []) {
  const apiKey = import.meta.env.REACT_APP_OPENAI_API_KEY;
  const MODEL = "gpt-4o";

  const systemPrompt = personaPrompts[personaName.toLowerCase()] || `You are ${personaName}, a specialized Vireon persona. Respond in character and voice.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...memory.map(entry => ({ role: entry.from === 'user' ? 'user' : 'assistant', content: entry.text })),
    { role: "user", content: prompt }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.85
      })
    });

    const data = await response.json();

    if (data?.error) {
      return {
        content: "error",
        reason: data.error.message || 'unknown_error',
        code: data.error.code || 'none'
      };
    }

    const result = data?.choices?.[0]?.message?.content;
    return { content: result || '[No response]' };

  } catch (error) {
    return {
      content: "error",
      reason: error.message || 'network_error'
    };
  }
}

/** DELEGATION BRIDGE **/
export const delegateToEloraBridge = async (target, action, data) => {
  try {
    const response = await fetch(`http://localhost:5050/api/ai/${target}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (err) {
    return { success: false, message: 'Bridge communication failed.', error: err.message };
  }
};

/** INTENT-BASED BACKEND ROUTER **/
export async function handleBackendCommand(persona, parsedIntent) {
  try {
    const userId = persona.toLowerCase();
    let tokenData = await getStoredToken(userId);

    if (!tokenData || tokenData.expiresAt < Date.now()) {
      tokenData = await refreshToken(
        userId,
        process.env.REACT_APP_CLIENT_ID,
        process.env.REACT_APP_CLIENT_SECRET,
        'https://oauth2.googleapis.com/token'
      );
    }

    const headers = {
      Authorization: `Bearer ${tokenData?.accessToken || ''}`,
    };

    let result;

    switch (parsedIntent.type) {
      case 'calendar':
        result = await axios.get('http://localhost:8000/calendar/upcoming', { headers });
        break;
      case 'email':
        result = await axios.post('http://localhost:8000/gmail/send', parsedIntent.payload, { headers });
        break;
      case 'drive':
        result = await axios.post('http://localhost:8000/drive/upload', parsedIntent.payload, { headers });
        break;
      case 'sheets':
        result = await axios.post('http://localhost:8000/sheets/append', parsedIntent.payload, { headers });
        break;
      case 'notion':
        result = await axios.post('http://localhost:8000/notion/create', parsedIntent.payload, { headers });
        break;
      default:
        throw new Error('Unsupported intent');
    }

    logBus.emit('log', {
      sender: persona,
      type: 'backend',
      message: `✅ ${parsedIntent.type} command succeeded.`,
      data: result.data,
    });

    return result.data;

  } catch (err) {
    logBus.emit('log', {
      sender: persona,
      type: 'error',
      message: `❌ Backend command failed: ${parsedIntent.type}`,
      error: err.message,
    });
    return null;
  }
}

/** INTENT DETECTOR **/
export function detectIntent(input) {
  const text = input.toLowerCase();

  if (text.includes('calendar') || text.includes('meeting') || text.includes('schedule')) {
    return { type: 'calendar' };
  }

  if (text.includes('send email') || text.includes('email')) {
    const to = input.match(/to\s+([^\s]+@[^\s]+\.[^\s]+)/i)?.[1] || '';
    const subject = input.match(/subject\s*:\s*([^\n]+)/i)?.[1] || '';
    const body = input.match(/body\s*:\s*([\s\S]+)/i)?.[1] || '';

    return {
      type: 'email',
      payload: { to, subject, body }
    };
  }

  return { type: 'unknown' };
}

/** MAIN MESSAGE HANDLER **/
export async function processUserMessage(persona, input, memory = []) {
  const intent = detectIntent(input);

  if (intent.type !== 'unknown') {
    const backendResult = await handleBackendCommand(persona, intent);
    return {
      content: backendResult || '[No backend response]',
      source: 'backend'
    };
  }

  const aiResult = await getChatResponse(input, persona, memory);

  return {
    content: aiResult.content || '[No response]',
    source: aiResult.source || 'openai',
    error: aiResult.reason || null
  };
}
