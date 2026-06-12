import React, { useEffect, useMemo, useRef, useState } from "react";
import ExecutionReceiptsPanel from "./ExecutionReceiptsPanel";
import "../styles/theme.css";
import "../styles/EloraConsole.css";

const runtimeBaseUrl =
  process.env.REACT_APP_AGENT_RUNTIME_URL || "http://localhost:4317";

const initialLog = [
  {
    from: "elora",
    text: "Agent runtime shell online. Messages stream through the backend service; execution logic no longer lives in React.",
    timestamp: Date.now(),
  },
];

const parseSseChunk = (chunk) => {
  return chunk
    .split("\n\n")
    .map((frame) => {
      const event = frame.match(/^event: (.+)$/m)?.[1] || "message";
      const rawData = frame.match(/^data: (.+)$/m)?.[1];
      if (!rawData) return null;
      try {
        return { event, data: JSON.parse(rawData) };
      } catch (error) {
        return { event: "error", data: { message: error.message } };
      }
    })
    .filter(Boolean);
};

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const approvalReasonLabels = {
  missing_explicit_user_approval:
    "This tool can write, send, commit, or execute code and must be approved by you first.",
  missing_react_ui_approval_context:
    "The model supplied confirmation without the React approval UI context, so the runtime blocked it.",
  voice_high_risk_actions_not_approved:
    "Voice-originated high-risk actions require a browser approval card before execution.",
  voice_high_risk_action_limit_exhausted:
    "The approved voice high-risk action limit was exhausted.",
  voice_policy_locked_tool:
    "Phone-call voice sessions cannot run write, send, purchase/commit, code-execution, or code workspace tools during the call.",
};

const isApprovalRuntimeEvent = (data) => {
  const type = String(data?.type || "");
  const status = String(
    data?.result?.status || data?.data?.result?.status || "",
  );
  return type.includes("approval") || status === "approval_required";
};

const toApprovalCard = (execution) => ({
  id: execution.id,
  toolName: execution.approvalRequest?.toolName || execution.action,
  riskLevel: execution.riskLevel || "unknown",
  requestedAction:
    execution.approvalRequest?.requestedAction || execution.action,
  sanitizedInputSummary:
    execution.approvalRequest?.sanitizedInputSummary ||
    JSON.stringify(execution.inputPayload || {}),
  reason: execution.approvalRequest?.reason || "approval_required",
  requestedAt:
    execution.approvalRequest?.requestedAt || execution.timestamps?.requestedAt,
});

const supportedRecorderMimeType = () => {
  if (!window.MediaRecorder) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) =>
    window.MediaRecorder.isTypeSupported(candidate),
  );
};

const EloraConsole = () => {
  const [input, setInput] = useState("");
  const [log, setLog] = useState(initialLog);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(
    () => window.localStorage.getItem("elora-session-id") || undefined,
  );
  const [voiceSessionId, setVoiceSessionId] = useState(
    () => window.localStorage.getItem("elora-voice-session-id") || undefined,
  );
  const [toolEvents, setToolEvents] = useState([]);
  const [taskStatus, setTaskStatus] = useState("idle");
  const [memoryRefs, setMemoryRefs] = useState([]);
  const [voiceConfig, setVoiceConfig] = useState(null);
  const [selectedVoice, setSelectedVoice] = useState(
    () => window.localStorage.getItem("elora-voice-profile") || "marin",
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalActions, setApprovalActions] = useState({});
  const [approvalNote, setApprovalNote] = useState("");
  const [executionsRefreshKey, setExecutionsRefreshKey] = useState(0);
  const activeAssistantIndex = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  const statusText = useMemo(
    () => (isStreaming || isVoiceProcessing ? "streaming" : "ready"),
    [isStreaming, isVoiceProcessing],
  );
  const voiceProviderStatus =
    voiceConfig?.provider === "openai"
      ? "OpenAI voice ready"
      : "voice provider not configured";
  const telephonyStatus = voiceConfig?.telephony?.ready
    ? "phone voice gated checks passed"
    : `phone voice gated${
        voiceConfig?.telephony?.missing?.length
          ? `: waiting on ${voiceConfig.telephony.missing.join(", ")}`
          : ""
      }`;

  const refreshExecutions = () => setExecutionsRefreshKey((key) => key + 1);

  const loadPendingApprovals = async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (sessionId) params.set("sessionId", sessionId);
    const response = await fetch(
      `${runtimeBaseUrl}/api/executions?${params.toString()}`,
    );
    if (!response.ok)
      throw new Error(`Unable to load approvals (${response.status})`);
    const payload = await response.json();
    const approvals = (payload.executions || [])
      .filter(
        (execution) =>
          execution.approvalStatus === "pending" && execution.approvalRequest,
      )
      .map(toApprovalCard);
    setPendingApprovals(approvals);
    return approvals;
  };

  useEffect(() => {
    loadPendingApprovals().catch(() => undefined);
  }, [sessionId, executionsRefreshKey]);

  useEffect(() => {
    let mounted = true;
    fetch(`${runtimeBaseUrl}/api/voice/config`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((config) => {
        if (!mounted || !config) return;
        setVoiceConfig(config);
        setSelectedVoice((current) =>
          config.voices?.includes(current)
            ? current
            : config.defaultVoice || "marin",
        );
      })
      .catch((error) => {
        if (mounted)
          setVoiceConfig({
            provider: "not_configured",
            voices: ["marin"],
            defaultVoice: "marin",
            error: error.message,
          });
      });
    return () => {
      mounted = false;
      if (mediaRecorderRef.current?.state === "recording")
        mediaRecorderRef.current.stop();
      mediaRecorderRef.current?.stream
        ?.getTracks?.()
        .forEach((track) => track.stop());
    };
  }, []);

  const logMessage = (text, from = "elora") => {
    setLog((prev) => [
      ...prev.slice(-100),
      { text, from, timestamp: Date.now() },
    ]);
  };

  const appendAssistantDelta = (text) => {
    setLog((prev) => {
      const next = [...prev];
      const existingIndex = activeAssistantIndex.current;
      if (existingIndex === null || !next[existingIndex]) {
        next.push({ from: "elora", text, timestamp: Date.now() });
        activeAssistantIndex.current = next.length - 1;
      } else {
        next[existingIndex] = {
          ...next[existingIndex],
          text: `${next[existingIndex].text}${text}`,
        };
      }
      return next.slice(-100);
    });
  };

  const handleRuntimeEvent = ({ event, data }) => {
    if (event === "session") {
      setSessionId(data.sessionId);
      window.localStorage.setItem("elora-session-id", data.sessionId);
    }

    if (event === "memory" || event === "completed") {
      setMemoryRefs(data.references || data.memories || []);
    }

    if (event === "runtime_event") {
      setToolEvents((prev) =>
        [{ type: data.type || "runtime_event", at: Date.now() }, ...prev].slice(
          0,
          8,
        ),
      );
      if (isApprovalRuntimeEvent(data)) {
        setTaskStatus("approval requested");
        window.setTimeout(() => {
          loadPendingApprovals().catch((error) =>
            logMessage(`Approval refresh failed: ${error.message}`, "system"),
          );
          refreshExecutions();
        }, 250);
      } else {
        setTaskStatus("tool activity");
      }
    }

   if (event === 'delta') {
  // Suppress raw structured JSON stream; show finalOutput.visibleReply on completion.
  return;
}

   if (event === "completed") {
  activeAssistantIndex.current = null;

  const visibleReply =
    data.finalOutput?.visibleReply ||
    (typeof data.finalOutput === "string" ? data.finalOutput : "");

  setTaskStatus(data.finalOutput?.taskStatus || "completed");

  if (visibleReply) {
    logMessage(visibleReply, "elora");
    void speakText(visibleReply);
  }

  loadPendingApprovals().catch(() => undefined);
  refreshExecutions();
}

    if (event === "error") {
      activeAssistantIndex.current = null;
      setTaskStatus("error");
      logMessage(`Runtime error: ${data.message}`, "system");
    }
  };

  const sendToRuntime = async (message) => {
    setIsStreaming(true);
    setTaskStatus("running");
    activeAssistantIndex.current = null;

    const response = await fetch(`${runtimeBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent runtime returned ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      frames.forEach((frame) =>
        parseSseChunk(`${frame}\n\n`).forEach(handleRuntimeEvent),
      );
    }

    if (buffer.trim()) parseSseChunk(buffer).forEach(handleRuntimeEvent);
  };

  const ensureVoiceSession = async () => {
    if (voiceSessionId) return voiceSessionId;
    const response = await fetch(`${runtimeBaseUrl}/api/voice/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, speaker: "user" }),
    });
    if (!response.ok)
      throw new Error(`Unable to create voice session (${response.status})`);
    const data = await response.json();
    const nextVoiceSessionId = data.voiceSession.id;
    setVoiceSessionId(nextVoiceSessionId);
    window.localStorage.setItem("elora-voice-session-id", nextVoiceSessionId);
    if (data.voiceSession.agentSessionId) {
      setSessionId(data.voiceSession.agentSessionId);
      window.localStorage.setItem(
        "elora-session-id",
        data.voiceSession.agentSessionId,
      );
    }
    return nextVoiceSessionId;
  };

  const playVoiceAudio = async (synthesis) => {
  console.log('[voice] synthesis response:', synthesis);

  if (!synthesis?.audioBase64) {
    logMessage('Voice playback unavailable: no audio was returned from the speech endpoint.', 'system');
    return;
  }

  if (!audioRef.current) {
    logMessage('Voice playback unavailable: audio player is not mounted.', 'system');
    return;
  }

  const mimeType = synthesis.mimeType || 'audio/mpeg';
  audioRef.current.pause();
  audioRef.current.src = `data:${mimeType};base64,${synthesis.audioBase64}`;
  audioRef.current.load();

  try {
    await audioRef.current.play();
    console.log('[voice] playback started');
  } catch (error) {
    console.error('[voice] browser playback failed:', error);
    logMessage(`Voice generated, but browser playback was blocked: ${error.message}. Press play on the audio bar.`, 'system');
  }
};

const speakText = async (text) => {
  const cleanText = String(text || '').trim();

  console.log('[voice] speakText called:', cleanText);

  if (!cleanText) {
    console.log('[voice] no text supplied to speakText');
    return;
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/api/voice/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voice: selectedVoice,
        responseFormat: voiceConfig?.responseFormat || 'mp3',
      }),
    });

    console.log('[voice] /api/voice/speech status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Speech runtime returned ${response.status}: ${errorText}`);
    }

    const synthesis = await response.json();
    await playVoiceAudio(synthesis);
  } catch (error) {
    console.error('[voice] speakText failed:', error);
    logMessage(`Voice playback unavailable: ${error.message}`, 'system');
  }
};

  const processVoiceBlob = async (blob) => {
    setIsVoiceProcessing(true);
    setTaskStatus("voice processing");
    try {
      const nextVoiceSessionId = await ensureVoiceSession();
      const audioBase64 = await blobToBase64(blob);
      const response = await fetch(
        `${runtimeBaseUrl}/api/voice/transcriptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceSessionId: nextVoiceSessionId,
            audioBase64,
            audioMimeType: blob.type || "audio/webm",
            voice: selectedVoice,
            respond: true,
          }),
        },
      );
      if (!response.ok)
        throw new Error(`Voice runtime returned ${response.status}`);
      const data = await response.json();
      if (data.voiceSession?.agentSessionId) {
        setSessionId(data.voiceSession.agentSessionId);
        window.localStorage.setItem(
          "elora-session-id",
          data.voiceSession.agentSessionId,
        );
      }
      if (data.transcription?.text)
        logMessage(`> ${data.transcription.text}`, "user");
      if (data.agent?.text) logMessage(data.agent.text, "elora");
      if (data.synthesis?.status === "completed")
        await playVoiceAudio(data.synthesis);
      if (data.synthesis?.status === "synthesis_pending")
        logMessage(data.synthesis.message, "system");
      setTaskStatus(data.status || "voice completed");
    } catch (error) {
      setTaskStatus("voice error");
      logMessage(`Voice error: ${error.message}`, "system");
    } finally {
      setIsVoiceProcessing(false);
    }
  };

  const handleStartRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      logMessage(
        "This browser does not support MediaRecorder microphone capture.",
        "system",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        processVoiceBlob(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setTaskStatus("listening");
    } catch (error) {
      logMessage(`Microphone unavailable: ${error.message}`, "system");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const handleVoiceChange = (event) => {
    setSelectedVoice(event.target.value);
    window.localStorage.setItem("elora-voice-profile", event.target.value);
  };

  const handleApprovalDecision = async (approval, decision) => {
    setApprovalActions((prev) => ({
      ...prev,
      [approval.id]: decision === "approve" ? "approving" : "denying",
    }));
    try {
      const response = await fetch(
        `${runtimeBaseUrl}/api/executions/${approval.id}/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, approvalNote }),
        },
      );
      if (!response.ok)
        throw new Error(`Approval endpoint returned ${response.status}`);
      await response.json();
      logMessage(
        `${decision === "approve" ? "Approved" : "Denied"} ${approval.toolName}.`,
        "system",
      );
      setApprovalNote("");
      await loadPendingApprovals();
      refreshExecutions();
    } catch (error) {
      logMessage(`Approval action failed: ${error.message}`, "system");
    } finally {
      setApprovalActions((prev) => {
        const next = { ...prev };
        delete next[approval.id];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    logMessage(`> ${trimmed}`, "user");
    setInput("");

    try {
      await sendToRuntime(trimmed);
    } catch (error) {
      activeAssistantIndex.current = null;
      setTaskStatus("error");
      logMessage(`Unable to reach Elora runtime: ${error.message}`, "system");
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="console-panel">
      <div className="console-header">
        <img
          src="/assets/crests/elora.png"
          alt="Elora Crest"
          className="crest-icon"
        />
        <h1>Elora – Shadow Empress</h1>
      </div>

      <div className="console-log">
        {log.map((entry, idx) => (
          <div key={`${entry.timestamp || "seed"}-${idx}`}>
            <strong>
              {entry.from === "user"
                ? ">"
                : entry.from === "system"
                  ? "System:"
                  : "Elora:"}
            </strong>{" "}
            {entry.text}
          </div>
        ))}
      </div>

      <div className="console-metrics">
        <p>Runtime: {statusText}</p>
        <p>Session: {sessionId || "pending backend session"}</p>
        <p>
          Voice Session: {voiceSessionId || "pending browser voice session"}
        </p>
        <p>Voice Provider: {voiceProviderStatus}</p>
        <p>Phone Voice: {telephonyStatus}</p>
        <p>Task Status: {taskStatus}</p>
        <p>Tool Calls / Approvals:</p>
        <ul className="runtime-list">
          {toolEvents.length ? (
            toolEvents.map((item) => (
              <li key={`${item.at}-${item.type}`}>{item.type}</li>
            ))
          ) : (
            <li>none yet</li>
          )}
        </ul>
        <p>Memory References:</p>
        <ul className="runtime-list">
          {memoryRefs.length ? (
            memoryRefs.map((item) => <li key={item.id}>{item.text}</li>)
          ) : (
            <li>none yet</li>
          )}
        </ul>
      </div>

      {pendingApprovals.length > 0 && (
        <section
          className="approval-workflow"
          aria-labelledby="approval-workflow-title"
        >
          <div className="approval-workflow-header">
            <div>
              <p className="approval-eyebrow">Human Approval Required</p>
              <h2 id="approval-workflow-title">
                Review blocked runtime actions
              </h2>
            </div>
            <span>{pendingApprovals.length} pending</span>
          </div>
          <label className="approval-note-label" htmlFor="approval-note">
            Approval note
          </label>
          <textarea
            id="approval-note"
            value={approvalNote}
            onChange={(event) => setApprovalNote(event.target.value)}
            placeholder="Optional note recorded with the approval or denial..."
            rows={2}
          />
          <div className="approval-card-list">
            {pendingApprovals.map((approval) => (
              <article className="approval-card" key={approval.id}>
                <div className="approval-card-topline">
                  <strong>{approval.toolName}</strong>
                  <span
                    className={`approval-risk approval-risk-${String(approval.riskLevel).replace(/_/g, "-")}`}
                  >
                    {approval.riskLevel}
                  </span>
                </div>
                <dl className="approval-detail-grid">
                  <div>
                    <dt>Requested action</dt>
                    <dd>{approval.requestedAction}</dd>
                  </div>
                  <div>
                    <dt>Input summary</dt>
                    <dd>
                      <code>{approval.sanitizedInputSummary}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Reason approval is needed</dt>
                    <dd>
                      {approvalReasonLabels[approval.reason] || approval.reason}
                    </dd>
                  </div>
                </dl>
                <div className="approval-actions">
                  <button
                    type="button"
                    onClick={() => handleApprovalDecision(approval, "approve")}
                    disabled={Boolean(approvalActions[approval.id])}
                  >
                    {approvalActions[approval.id] === "approving"
                      ? "Approving…"
                      : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="approval-deny-button"
                    onClick={() => handleApprovalDecision(approval, "deny")}
                    disabled={Boolean(approvalActions[approval.id])}
                  >
                    {approvalActions[approval.id] === "denying"
                      ? "Denying…"
                      : "Deny"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="voice-controls" aria-label="Browser verbal chat controls">
        <div>
          <label htmlFor="voice-select">Elora voice</label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={handleVoiceChange}
            disabled={isRecording || isVoiceProcessing}
          >
            {(voiceConfig?.voices || [selectedVoice]).map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isVoiceProcessing || isStreaming}
        >
          {isRecording ? "Stop & Send" : "Hold to Record Voice"}
        </button>
        <p>
          {voiceConfig?.disclosure ||
            "Browser voice records a conversational prompt, sends it through the text-loop runtime, and previews AI-generated audio when a provider is configured."}
        </p>
        <audio ref={audioRef} controls className="voice-playback">
          Your browser does not support audio playback.
        </audio>
      </div>

      <form onSubmit={handleSubmit} className="console-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message to the Elora agent runtime..."
          className="console-input"
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>
          {isStreaming ? "Streaming…" : "Send"}
        </button>
      </form>

      <ExecutionReceiptsPanel
        sessionId={sessionId}
        refreshNonce={executionsRefreshKey}
      />
    </div>
  );
};

export default EloraConsole;
