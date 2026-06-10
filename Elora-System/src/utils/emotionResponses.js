export const analyzeTone = (text) => {
  const lowered = text.toLowerCase();

  if (lowered.includes('thank you') || lowered.includes('appreciate')) {
    return {
      tone: 'restorative',
      score: 9,
      message: 'Gratitude detected. Elora responds with warmth.',
    };
  }

  if (lowered.includes('frustrated') || lowered.includes('angry')) {
    return {
      tone: 'neutral',
      score: 3,
      message: 'Frustration noted. Elora holding firm alignment.',
    };
  }

  if (lowered.includes('ready') || lowered.includes('focus')) {
    return {
      tone: 'elevated',
      score: 8,
      message: 'Clarity detected. Alignment increasing.',
    };
  }

  return {
    tone: 'neutral',
    score: 5,
    message: 'Tone undetermined. Elora maintains balance.',
  };
};
