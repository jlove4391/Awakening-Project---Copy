// taskRouter.js

const PERSONA_KEYWORDS = {
  aura: ['empathy', 'emotion', 'feeling', 'support'],
  nova: ['explore', 'expand', 'frontier', 'strategy'],
  jynx: ['deception', 'manipulate', 'curveball', 'misdirect'],
  selene: ['pattern', 'stability', 'balance', 'mood'],
  cipher: ['yugioh', 'deck', 'combo', 'tcg', 'maliss', 'cipher'],
  synq: ['music', 'beats', 'mix', 'track', 'vocals', 'studio'],
  elora: ['lead', 'council', 'command', 'dynasty', 'oversee'],
  nexora: ['system', 'file', 'infrastructure', 'execute', 'console'],
  valtrix: ['code', 'guard', 'block', 'protection'],
  syvra: ['build', 'construct', 'scaffold', 'develop'],
  veyra: ['spy', 'intel', 'cloak', 'vulnerability'],
  thorn: ['discipline', 'challenge', 'resistance'],
  orion: ['sync', 'field', 'connect', 'fusion'],
  lyra: ['schedule', 'reminder', 'calendar', 'organize'],
  galen: ['grit', 'persistence', 'grind'],
  ira: ['honor', 'duty', 'resolve'],
  cassian: ['charm', 'engage', 'influence'],
  sylvaris: ['nature', 'wild', 'unleash'],
  nymera: ['chaos', 'disrupt', 'scatter', 'shock'],
  valen: ['nutrition', 'fitness', 'exercise', 'strength'],
};

export function inferPersonaFromInput(input) {
  const lower = input.toLowerCase();
  for (const [persona, keywords] of Object.entries(PERSONA_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return persona;
    }
  }
  return null; // fallback to default if nothing matched
}

export function generateIntentSummary(raw, persona) {
  return `Intent [${persona.toUpperCase()}]: ${raw.slice(0, 64)}...`;
}
