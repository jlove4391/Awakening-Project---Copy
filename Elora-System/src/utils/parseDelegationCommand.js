// src/utils/parseDelegationCommand.js

const knownPersonas = [
  'nexora', // ✅ Replaces nova
  'selene',
  'jynx',
  'aura',
  'cipher',
  'elora',
  'cassian',
  'lyra',
  'darius',
  'nym',
  'vay',
  'orion'
];

export function parseDelegationCommand(input) {
  const normalized = input.toLowerCase().trim();

  const pattern = new RegExp(
    `(?:delegate(?:\\s+this)?|initiate delegation to|send to|assign to|have)\\s+(${knownPersonas.join('|')})[:\\s,-]+(.+)$`,
    'i'
  );

  const match = normalized.match(pattern);

  if (!match) return [];

  const persona = match[1].trim();
  const task = match[2].trim();

  return [{ persona, task }];
}
