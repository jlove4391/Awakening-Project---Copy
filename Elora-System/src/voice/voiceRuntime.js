// Reusable browser voice runtime for Vireon CORE.
// This file only manages voice listening/speaking state. It does not execute tasks.

export const VOICE_STATES = {
  IDLE: 'idle',
  LOCKED: 'locked',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  EXECUTING: 'executing',
  UNAUTHORIZED: 'unauthorized',
  ERROR: 'error',
};

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionAvailable() {
  return Boolean(getSpeechRecognitionConstructor());
}

export function isSpeechSynthesisAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function createVoiceRuntime(options = {}) {
  const {
    onTranscript,
    onStateChange,
    onError,
    language = 'en-US',
  } = options;

  const SpeechRecognition = getSpeechRecognitionConstructor();
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  let state = VOICE_STATES.IDLE;
  let shouldKeepListening = false;
  let isSpeaking = false;
  let resumeListeningAfterSpeech = false;

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;
  }

  function setState(nextState) {
    state = nextState;
    if (onStateChange) onStateChange(nextState);
  }

  function stopListening() {
    shouldKeepListening = false;
    if (recognition) recognition.stop();
    if (!isSpeaking) setState(VOICE_STATES.IDLE);
  }

  function startListening() {
    if (!recognition) {
      setState(VOICE_STATES.ERROR);
      if (onError) onError(new Error('Speech recognition is not available in this browser.'));
      return false;
    }

    // Do not let Elora listen to her own spoken response.
    if (isSpeaking) {
      resumeListeningAfterSpeech = true;
      return false;
    }

    shouldKeepListening = true;
    try {
      recognition.start();
      return true;
    } catch (err) {
      shouldKeepListening = false;
      setState(VOICE_STATES.ERROR);
      if (onError) onError(err);
      return false;
    }
  }

  function stopSpeech() {
    if (isSpeechSynthesisAvailable()) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
    resumeListeningAfterSpeech = false;
    if (!shouldKeepListening) setState(VOICE_STATES.IDLE);
  }

  function speak(text, speakOptions = {}) {
    if (!text) return false;

    if (!isSpeechSynthesisAvailable()) {
      setState(VOICE_STATES.ERROR);
      if (onError) onError(new Error('Speech synthesis is not available in this browser.'));
      return false;
    }

    // Stop listening first so the microphone does not capture Elora's own voice.
    if (recognition) recognition.stop();

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = speakOptions.rate || 1;
    utterance.pitch = speakOptions.pitch || 0.95;

    const voices = window.speechSynthesis.getVoices();
    utterance.voice = speakOptions.voice || voices.find(v => v.lang === language) || voices[0] || null;

    utterance.onstart = () => {
      isSpeaking = true;
      setState(VOICE_STATES.SPEAKING);
    };

    utterance.onend = () => {
      isSpeaking = false;
      if (resumeListeningAfterSpeech) {
        resumeListeningAfterSpeech = false;
        startListening();
      } else {
        setState(VOICE_STATES.IDLE);
      }
    };

    utterance.onerror = (event) => {
      isSpeaking = false;
      resumeListeningAfterSpeech = false;
      setState(VOICE_STATES.ERROR);
      if (onError) onError(event.error || new Error('Speech synthesis failed.'));
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  function interrupt() {
    // Interruption means stop both Elora's voice and the microphone loop.
    stopSpeech();
    stopListening();
    setState(VOICE_STATES.IDLE);
  }

  function setLocked(isLocked) {
    stopListening();
    setState(isLocked ? VOICE_STATES.LOCKED : VOICE_STATES.IDLE);
  }

  function setThinking() {
    setState(VOICE_STATES.THINKING);
  }

  function setExecuting() {
    setState(VOICE_STATES.EXECUTING);
  }

  function setUnauthorized() {
    setState(VOICE_STATES.UNAUTHORIZED);
  }

  if (recognition) {
    recognition.onstart = () => {
      if (!isSpeaking) setState(VOICE_STATES.LISTENING);
    };

    recognition.onend = () => {
      if (shouldKeepListening && !isSpeaking) {
        startListening();
      } else if (!isSpeaking && state === VOICE_STATES.LISTENING) {
        setState(VOICE_STATES.IDLE);
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (onTranscript && transcript) onTranscript(transcript);
    };

    recognition.onerror = (event) => {
      shouldKeepListening = false;
      setState(VOICE_STATES.ERROR);
      if (onError) onError(event.error || new Error('Speech recognition failed.'));
    };
  }

  return {
    getState: () => state,
    isListening: () => state === VOICE_STATES.LISTENING,
    isSpeaking: () => isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeech,
    interrupt,
    setLocked,
    setThinking,
    setExecuting,
    setUnauthorized,
  };
}
