import { useState, useEffect } from 'react';

const useVoiceEngine = ({ onResult, voiceId }) => {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  let recognition = null;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
  }

  const startListening = () => {
    if (recognition && !listening) {
      recognition.start();
      setListening(true);
    }
  };

  const stopListening = () => {
    if (recognition && listening) {
      recognition.stop();
      setListening(false);
    }
  };

  if (recognition) {
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        onResult(final);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };
  }

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceId) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find((v) => v.voiceURI.includes(voiceId));
      if (selected) utterance.voice = selected;
    }
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, []);

  return { speak, startListening, stopListening, interimTranscript, listening };
};

export default useVoiceEngine;
