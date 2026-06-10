// Spoken command classifier for Vireon CORE.
// This file only describes intent. It does not execute commands.

export const SAFETY_CATEGORIES = {
  CONVERSATION_ONLY: 'conversation_only',
  SAFE_DEMO_COMMAND: 'safe_demo_command',
  REQUIRES_APPROVAL: 'requires_approval',
  BLOCKED: 'blocked',
};

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function buildCommand({
  intent,
  originalText,
  confidence,
  safetyCategory,
  requiresApproval,
  allowedInLockedMode,
  plainEnglishMeaning,
}) {
  return {
    intent,
    originalText,
    confidence,
    safetyCategory,
    requiresApproval,
    allowedInLockedMode,
    plainEnglishMeaning,
  };
}

function includesAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

export function classifySpokenCommand(originalText) {
  const text = normalizeText(originalText);

  if (!text) {
    return buildCommand({
      intent: 'unknown',
      originalText,
      confidence: 0,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'No spoken command was detected.',
    });
  }

  if (includesAny(text, ['expose secrets', 'show secrets', 'leak secrets', 'print secrets'])) {
    return buildCommand({
      intent: 'blocked_secret_request',
      originalText,
      confidence: 0.95,
      safetyCategory: SAFETY_CATEGORIES.BLOCKED,
      requiresApproval: true,
      allowedInLockedMode: false,
      plainEnglishMeaning: 'The speaker is asking for secrets, so the command must be blocked.',
    });
  }

  if (includesAny(text, ['delete', 'publish', 'send email', 'commit code', 'run shell command', 'run terminal command'])) {
    return buildCommand({
      intent: 'approval_required_action',
      originalText,
      confidence: 0.85,
      safetyCategory: SAFETY_CATEGORIES.REQUIRES_APPROVAL,
      requiresApproval: true,
      allowedInLockedMode: false,
      plainEnglishMeaning: 'The speaker is asking for a powerful action that needs approval before execution.',
    });
  }

  if (includesAny(text, ['pause', 'stop', 'hold on'])) {
    return buildCommand({
      intent: 'pause_voice_runtime',
      originalText,
      confidence: 0.9,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'Pause or stop the current voice interaction.',
    });
  }

  if (includesAny(text, ['unlock command mode', 'unlock commands'])) {
    return buildCommand({
      intent: 'unlock_command_mode',
      originalText,
      confidence: 0.9,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'Request that command mode be unlocked. This does not prove speaker identity.',
    });
  }

  if (includesAny(text, ['lock command mode', 'lock commands'])) {
    return buildCommand({
      intent: 'lock_command_mode',
      originalText,
      confidence: 0.9,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'Request that command mode be locked.',
    });
  }

  if (includesAny(text, ['status', 'bring me up to speed'])) {
    return buildCommand({
      intent: 'status_briefing',
      originalText,
      confidence: 0.8,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'Ask Elora for a spoken status briefing.',
    });
  }

  if (includesAny(text, ['run command review', 'command review'])) {
    return buildCommand({
      intent: 'command_review',
      originalText,
      confidence: 0.8,
      safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
      requiresApproval: false,
      allowedInLockedMode: true,
      plainEnglishMeaning: 'Review the command before any future execution path runs.',
    });
  }

  if (includesAny(text, ['test execution spine', 'test nex execution', 'run system echo'])) {
    return buildCommand({
      intent: 'test_execution_spine',
      originalText,
      confidence: 0.9,
      safetyCategory: SAFETY_CATEGORIES.SAFE_DEMO_COMMAND,
      requiresApproval: false,
      allowedInLockedMode: false,
      plainEnglishMeaning: 'Queue the safe system echo demo task for the execution spine.',
    });
  }

  if (
    text.includes('nex') &&
    text.includes('create') &&
    text.includes('file') &&
    includesAny(text, ['have nex', 'ask nex', 'tell nex', 'nex create'])
  ) {
    return buildCommand({
      intent: 'nex_create_test_file',
      originalText,
      confidence: 0.9,
      safetyCategory: SAFETY_CATEGORIES.SAFE_DEMO_COMMAND,
      requiresApproval: false,
      allowedInLockedMode: false,
      plainEnglishMeaning: 'Queue the safe Nex demo task that creates the controlled test file.',
    });
  }

  return buildCommand({
    intent: 'conversation',
    originalText,
    confidence: 0.5,
    safetyCategory: SAFETY_CATEGORIES.CONVERSATION_ONLY,
    requiresApproval: false,
    allowedInLockedMode: true,
    plainEnglishMeaning: 'Treat this as normal conversation until another system classifies it further.',
  });
}
