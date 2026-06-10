// delegationParser.js

export function parseDelegationCommand(commandText) {
  const tasks = [];

  // Normalize input for simple parsing
  const text = commandText.toLowerCase();

  // Synq (music/production-related)
  if (text.includes("beat") || text.includes("instrumental") || text.includes("track")) {
    tasks.push({
      persona: "Synq",
      task: "Begin instrumental analysis or creative input based on referenced track."
    });
  }

  // Cipher (yugioh/strategy-related)
  if (text.includes("deck") || text.includes("combo") || text.includes("test hand") || text.includes("yugioh")) {
    tasks.push({
      persona: "Cipher",
      task: "Initiate deck strategy analysis and optimization suggestion."
    });
  }

  // ✅ Nexora (system logic, infrastructure) — replaces Nova
  if (text.includes("status") || text.includes("system") || text.includes("logic")) {
    tasks.push({
      persona: "Nexora",
      task: "Run system diagnostics and return any operational alerts or gaps."
    });
  }

  // Jynx (monetization/financial)
  if (text.includes("pricing") || text.includes("monetization") || text.includes("financial")) {
    tasks.push({
      persona: "Jynx",
      task: "Perform revenue analysis or return financial strategies."
    });
  }

  // Add more routing rules as needed...

  return tasks;
}
