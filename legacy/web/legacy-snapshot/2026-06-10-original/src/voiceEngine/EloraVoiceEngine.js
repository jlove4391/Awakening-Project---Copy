// src/voiceEngine/EloraVoiceEngine.js

import { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function useEloraVoiceEngine() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);
  const controller = useRef(null);

  // --- Start/Stop Mic ---
  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.start();
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        setTranscript(speechResult);
        handleLLMResponse(speechResult);
      };
      recognition.onerror = (event) => console.error(event.error);
      recognition.onend = () => setIsListening(false);
    } else {
      alert("Browser does not support SpeechRecognition.");
    }
  };

  const stopListening = () => {
    setIsListening(false);
    if (controller.current) controller.current.abort();
  };

  // --- Handle LLM + TTS ---
  const handleLLMResponse = async (text) => {
    try {
      // Send text to your LLM (Vireon Core or OpenAI)
      const llmRes = await axios.post('/api/chat', { prompt: text });
      const reply = llmRes.data.reply;

      // Get Elora's voice mode
      const mode = await import("./eloraVoiceModes.json");
      const voiceSettings = mode.regal; // default to 'regal'

      // Get TTS audio from ElevenLabs (or fallback)
      const ttsRes = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceSettings.voice_id}/stream`,
        {
          text: reply,
          voice_settings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarity_boost
          }
        },
        {
          headers: {
            "xi-api-key": import.meta.env.VITE_ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
          },
          responseType: 'arraybuffer'
        }
      );

      const audioBlob = new Blob([ttsRes.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      audioRef.current = new Audio(audioUrl);
      setIsSpeaking(true);
      audioRef.current.play();
      audioRef.current.onended = () => setIsSpeaking(false);

    } catch (err) {
      console.error("Voice Engine Error:", err);
    }
  };

  // ✅ FIX: now exporting handleLLMResponse too!
  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    transcript,
    handleLLMResponse
  };
}
