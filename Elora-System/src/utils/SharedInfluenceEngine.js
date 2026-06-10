// src/utils/SharedInfluenceEngine.js
export function runSharedInfluence(aiStates, updateAIState) {
  Object.entries(aiStates).forEach(([name, state]) => {
    // Aura influence logic
    if (name === 'aura' && state.mood === 'restorative') {
      updateAIState('nova', { mood: 'elevated' });
      updateAIState('selene', { mood: 'elevated' });
    }

    // Elora command tone sharpens others
    if (name === 'elora' && state.commandFocus === 'high') {
      Object.keys(aiStates).forEach(target => {
        if (target !== 'elora') updateAIState(target, { stability: 90 });
      });
    }

    // Synq's creativity boosts Aura/Jynx
    if (name === 'synq' && state.creativeState === 'peak') {
      updateAIState('aura', { mood: 'elevated' });
      updateAIState('jynx', { mood: 'elevated' });
    }

    // Cipher's focus enhances Nova logic
    if (name === 'cipher' && state.logicState === 'tactical') {
      updateAIState('nova', { stability: 100 });
    }
  });
}
