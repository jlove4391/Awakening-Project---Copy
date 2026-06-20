import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const runtimeBaseUrl =
  process.env.REACT_APP_AGENT_RUNTIME_URL || "http://localhost:4317";

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
};

const riskClass = (riskLevel) =>
  `execution-risk execution-risk-${String(riskLevel || "unknown").replace(/_/g, "-")}`;

const humanizeStatus = (value) =>
  String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const explicitApprovalBoundaries = new Set([
  "rmt",
  "personal_information_sensitive",
  "private_data_sensitive",
  "destructive_irreversible",
  "external_commitment",
]);

const inferApprovalBoundary = (item = {}) => {
  const request = item.approvalRequest || item.pendingToolAction || item.approval || {};
  const rawBoundary =
    item.policyBoundary ||
    request.boundary ||
    request.policyBoundary ||
    request.approvalBoundary ||
    item.boundary;
  if (rawBoundary) return String(rawBoundary);

  const combined = [
    item.approvalScope,
    request.approvalScope,
    item.riskLevel,
    request.reason,
    item.blockedReason,
    item.uiState?.blockedReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/rmt|purchase|payment|pay|financial|contract|subscription|commit/.test(combined)) return "rmt";
  if (/private[_ -]?data|personal[_ -]?information|personal[_ -]?info|sensitive|secret|token/.test(combined)) return "personal_information_sensitive";
  if (/destructive|irreversible|permanent|destroy|delete/.test(combined)) return "destructive_irreversible";
  if (/external[._ -]?send|external[._ -]?commitment|send|share|publish|expose/.test(combined)) return "external_commitment";
  return undefined;
};

const isExplicitApprovalBoundary = (item) => explicitApprovalBoundaries.has(inferApprovalBoundary(item));

const trustDomainLabel = (item = {}) =>
  item.trustDomain ||
  item.policyDecision?.trustDomain ||
  (String(item.approvalScope || "").startsWith("repo.") ? "repository" : undefined) ||
  item.audit?.category ||
  item.category ||
  "runtime";

const executionOutcomeLabel = (execution) => {
  if (execution.policyAction === "setup_needed") return "Setup-needed receipt";
  if (execution.status === "running") return "Active execution";
  if (execution.status === "completed") return "Completed receipt";
  if (execution.status === "blocked" && !isExplicitApprovalBoundary(execution)) return "Setup or policy receipt";
  return humanizeStatus(execution.status);
};

const taskApprovalStatus = (task) => {
  if (task.uiState?.approvalStatus) return task.uiState.approvalStatus;
  const requirements = task.approvalRequirements || [];
  if (requirements.some((item) => item.status === "rejected")) return "rejected";
  if (requirements.some((item) => item.status === "pending" || !item.status)) return "pending";
  return requirements.length ? "approved" : "not_required";
};

const hasPendingTaskApproval = (task) =>
  (task.approvalRequirements || []).some(
    (item) => item.required !== false && (item.status === "pending" || !item.status),
  );

const latestApprovedRequirement = (task) =>
  [...(task.approvalRequirements || [])]
    .filter((item) => item.status === "approved")
    .sort((a, b) => String(b.approvedAt || "").localeCompare(String(a.approvedAt || "")))[0];

const pendingStepAction = (task) => {
  if (task.pendingToolAction?.approvalStatus === "pending" && isExplicitApprovalBoundary(task.pendingToolAction)) {
    return task.pendingToolAction;
  }
  return (task.executionPlan || []).find(
    (step) =>
      step.approval?.required &&
      (step.approvalStatus === "pending" || step.approval?.status === "pending") &&
      isExplicitApprovalBoundary(step),
  );
};

const taskWorkerStateCopy = (task) => {
  const status = task.uiState?.status || task.status;
  const currentStep = task.uiState?.currentWorkerStep;
  const receiptSummary = task.receipt?.summary || task.result?.summary;
  const errorSummary = task.result?.error?.message || task.result?.summary;

  switch (status) {
    case "pending_approval":
      return {
        primary: "Waiting for task approval.",
        secondary: "Nexora has not started this delegated task yet.",
      };
    case "queued":
      return {
        primary: "Queued for Nexora.",
        secondary: "This task is saved and will start automatically.",
      };
    case "running":
      return {
        primary: "Nexora is working on this task.",
        secondary: currentStep?.targetTool
          ? `Current step: ${currentStep.targetTool}.`
          : "Worker progress is active.",
      };
    case "blocked": {
      const reason = task.uiState?.blockedReason || task.blockedReason || "unknown";
      const pendingTool = task.pendingToolAction || task.uiState?.missingApproval;
      const missingConfig = task.uiState?.missingConfiguration;
      if (reason === "provider_configuration_required") {
        return {
          primary: `${missingConfig?.providerName || missingConfig?.provider || "Provider"} needs setup before Nexora can continue.`,
          secondary: missingConfig?.message || missingConfig?.missingConfigHint || "Provider configuration is required.",
          nextAction: missingConfig?.nextManualAction || "Connect the provider, then resume the task.",
          reason: humanizeStatus(reason),
        };
      }
      if (reason === "step_approval_required") {
        const toolName = pendingTool?.toolName || currentStep?.targetTool || "the next tool action";
        return {
          primary: "Approval needed before Nexora can continue.",
          secondary: `Review ${toolName} before approving this worker step.`,
          nextAction: "Approve the blocked step only if the action is expected.",
          reason: humanizeStatus(reason),
        };
      }
      if (reason === "worker_unavailable") {
        return {
          primary: "Task saved. Nexora worker is not available yet.",
          secondary: "No configured worker accepted this task.",
          nextAction: "Resume when worker support is available.",
          reason: humanizeStatus(reason),
        };
      }
      if (reason === "policy_block") {
        return {
          primary: "Nexora cannot perform this action under the current policy.",
          secondary: "Review the blocked tool and policy reason.",
          nextAction: "Change the request or policy before retrying.",
          reason: humanizeStatus(reason),
        };
      }
      return {
        primary: "Nexora is blocked.",
        secondary: "Review the latest task event for details.",
        nextAction: "Resolve the blocker, then resume the task.",
        reason: humanizeStatus(reason),
      };
    }
    case "completed":
      return {
        primary: "Task completed.",
        secondary: receiptSummary || "Receipt summary pending.",
      };
    case "failed":
      return {
        primary: "Task failed.",
        secondary: errorSummary || "Failure receipt pending.",
      };
    default:
      return {
        primary: "Task cancelled.",
        secondary: receiptSummary || "Cancellation receipt pending.",
      };
  }
};

const executionSummary = (execution) => {
  if (execution.action === "delegation.approve_task") {
    return "Approval recorded";
  }
  return (
    execution.receipt?.summary ||
    execution.providerResponseSummary ||
    "Receipt pending"
  );
};

const ExecutionReceiptsPanel = ({
  sessionId,
  limit = 12,
  refreshNonce = 0,
}) => {
  const [executions, setExecutions] = useState([]);
  const [delegatedTasks, setDelegatedTasks] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [approvalActions, setApprovalActions] = useState({});
  const isMountedRef = useRef(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("sessionId", sessionId);
    return params.toString();
  }, [limit, sessionId]);

  const loadExecutions = useCallback(
    async ({ showLoading = true } = {}) => {
      try {
        if (showLoading) setStatus("loading");
        const taskParams = new URLSearchParams();
        if (sessionId) taskParams.set("sessionId", sessionId);
        else taskParams.set("includeAllSessions", "true");
        const [response, taskResponse] = await Promise.all([
          fetch(`${runtimeBaseUrl}/api/executions?${query}`),
          fetch(`${runtimeBaseUrl}/api/tasks?${taskParams.toString()}`),
        ]);
        if (!response.ok)
          throw new Error(`runtime returned ${response.status}`);
        if (!taskResponse.ok)
          throw new Error(`task runtime returned ${taskResponse.status}`);
        const [payload, taskPayload] = await Promise.all([
          response.json(),
          taskResponse.json(),
        ]);
        if (!isMountedRef.current) return;
        setExecutions(payload.executions || []);
        setDelegatedTasks(taskPayload.tasks || []);
        setStatus("ready");
        setError("");
      } catch (loadError) {
        if (!isMountedRef.current) return;
        setStatus("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load execution receipts",
        );
      }
    },
    [query, sessionId],
  );

  useEffect(() => {
    isMountedRef.current = true;
    loadExecutions();
    const interval = window.setInterval(
      () => loadExecutions({ showLoading: false }),
      7000,
    );
    return () => {
      isMountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [loadExecutions, refreshNonce]);

  const handleApproveTask = async (task) => {
    setApprovalActions((prev) => ({ ...prev, [task.id]: "approving" }));
    try {
      const response = await fetch(`${runtimeBaseUrl}/api/tasks/${task.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedByUser: true,
          approver: "user",
          note: "Approved from execution receipts panel.",
        }),
      });
      if (!response.ok)
        throw new Error(`task approval returned ${response.status}`);
      const payload = await response.json();
      if (payload.task) {
        setDelegatedTasks((prev) =>
          prev.map((item) => (item.id === payload.task.id ? payload.task : item)),
        );
      }
      await loadExecutions({ showLoading: false });
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Unable to approve delegated task",
      );
    } finally {
      setApprovalActions((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  const handleStepDecision = async (task, stepAction, decision) => {
    const actionKey = `${task.id}:${stepAction.stepId || stepAction.id}`;
    setApprovalActions((prev) => ({
      ...prev,
      [actionKey]: decision === "approve" ? "approving" : "denying",
    }));
    try {
      const stepId = stepAction.stepId || stepAction.id;
      const response = await fetch(
        `${runtimeBaseUrl}/api/tasks/${task.id}/steps/${stepId}/${decision}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmedByUser: decision === "approve" ? true : undefined,
            approver: "user",
            note:
              decision === "approve"
                ? "Approved blocked worker step from execution receipts panel."
                : "Denied blocked worker step from execution receipts panel.",
          }),
        },
      );
      if (!response.ok)
        throw new Error(`step ${decision} returned ${response.status}`);
      const payload = await response.json();
      if (payload.task) {
        setDelegatedTasks((prev) =>
          prev.map((item) => (item.id === payload.task.id ? payload.task : item)),
        );
      }
      await loadExecutions({ showLoading: false });
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : `Unable to ${decision} delegated step`,
      );
    } finally {
      setApprovalActions((prev) => {
        const next = { ...prev };
        delete next[actionKey];
        return next;
      });
    }
  };

  return (
    <section
      className="execution-receipts-panel"
      aria-labelledby="execution-receipts-title"
    >
      <div className="execution-receipts-header">
        <div>
          <p className="core-card-label">Runtime Source of Truth</p>
          <h2 id="execution-receipts-title" className="core-card-title">
            Executions & Receipts
          </h2>
        </div>
        <span className={`status-pill execution-status-${status}`}>
          {status}
        </span>
      </div>

      <p className="core-card-copy">
        Recent tool calls and delegated tasks persisted by the backend runtime,
        including approval, risk, linked IDs, task receipts, and receipt summaries.
      </p>

      {error && (
        <div className="execution-panel-error">
          Execution feed unavailable: {error}
        </div>
      )}

      <div className="execution-record-list">
        {delegatedTasks.map((task) => {
          const workerCopy = taskWorkerStateCopy(task);
          const approval = latestApprovedRequirement(task);
          const approvalState = taskApprovalStatus(task);
          const needsTaskApproval =
            task.status === "pending_approval" &&
            approvalState === "pending" &&
            hasPendingTaskApproval(task) &&
            isExplicitApprovalBoundary(task);
          const stepAction = pendingStepAction(task);
          const stepActionKey = stepAction
            ? `${task.id}:${stepAction.stepId || stepAction.id}`
            : "";

          return (
            <article
              className="execution-record-card delegated-task-card"
              key={`${task.id}-${task.updatedAt}`}
            >
              <div className="execution-record-topline">
                <strong>{task.objective}</strong>
                <span className={`execution-risk task-status-${task.status}`}>
                  Worker: {humanizeStatus(task.uiState?.status || task.status)}
                </span>
              </div>

              <div className="execution-record-meta">
                <span>{task.parentAgent} → {task.assignedAgent}</span>
                <span>events: {task.auditTrail?.length || 0}</span>
                <span>tools: {task.requiredTools?.join(", ") || "none"}</span>
              </div>

              {approvalState === "approved" && (
                <p className="execution-approval-summary">
                  Approval recorded{approval?.approver ? ` by ${approval.approver}` : ""}
                  {approval?.approvedAt ? ` at ${formatDateTime(approval.approvedAt)}` : ""}.
                </p>
              )}

              {needsTaskApproval && (
                <div className="execution-approval-summary">
                  <p>Task approval is pending before Nexora can start.</p>
                  <div className="approval-actions">
                    <button
                      type="button"
                      onClick={() => handleApproveTask(task)}
                      disabled={Boolean(approvalActions[task.id])}
                    >
                      {approvalActions[task.id] === "approving"
                        ? "Approving…"
                        : "Approve task"}
                    </button>
                  </div>
                </div>
              )}

              {task.status === "blocked" && stepAction && (
                <div className="execution-approval-summary">
                  <p>
                    Step approval is pending for{" "}
                    {stepAction.toolName || stepAction.targetTool || "the blocked tool action"}.
                  </p>
                  <div className="approval-actions">
                    <button
                      type="button"
                      onClick={() => handleStepDecision(task, stepAction, "approve")}
                      disabled={Boolean(approvalActions[stepActionKey])}
                    >
                      {approvalActions[stepActionKey] === "approving"
                        ? "Approving…"
                        : "Approve step"}
                    </button>
                    <button
                      type="button"
                      className="approval-deny-button"
                      onClick={() => handleStepDecision(task, stepAction, "deny")}
                      disabled={Boolean(approvalActions[stepActionKey])}
                    >
                      {approvalActions[stepActionKey] === "denying"
                        ? "Denying…"
                        : "Deny step"}
                    </button>
                  </div>
                </div>
              )}

              <div className="worker-state-panel">
                <p className="execution-receipt-summary">{workerCopy.primary}</p>
                <p className="execution-provider-summary">{workerCopy.secondary}</p>
                <p className="execution-provider-summary">Trust domain: {trustDomainLabel(task)} · Outcome: {executionOutcomeLabel(task)}</p>
                {task.status === "blocked" && (
                  <dl className="execution-blocked-detail">
                    <div>
                      <dt>Blocked reason</dt>
                      <dd>{workerCopy.reason || humanizeStatus(task.blockedReason)}</dd>
                    </div>
                    <div>
                      <dt>Next action</dt>
                      <dd>{workerCopy.nextAction || "Resolve the blocker, then resume the task."}</dd>
                    </div>
                  </dl>
                )}
              </div>

              {task.status === "completed" && (
                <p className="execution-receipt-summary">
                  Receipt: {task.receipt?.summary || task.result?.summary || "Receipt summary pending"}
                </p>
              )}

              <dl className="execution-detail-grid">
                <div>
                  <dt>Session</dt>
                  <dd>{task.sessionId || "—"}</dd>
                </div>
                <div>
                  <dt>Approvals</dt>
                  <dd>{humanizeStatus(approvalState)}</dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>{task.receipt?.id || "—"}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(task.updatedAt || task.createdAt)}</dd>
                </div>
              </dl>

              {task.constraints?.length > 0 && (
                <p className="execution-provider-summary">
                  Constraints: {task.constraints.join("; ")}
                </p>
              )}
            </article>
          );
        })}

        {executions.length === 0 && delegatedTasks.length === 0 && !error ? (
          <div className="execution-empty-state">
            No execution records or delegated tasks have been issued yet.
          </div>
        ) : (
          executions.map((execution) => (
            <article
              className="execution-record-card"
              key={`${execution.id}-${execution.timestamps?.completedAt || execution.timestamps?.requestedAt}`}
            >
              <div className="execution-record-topline">
                <strong>{execution.action}</strong>
                <span className={riskClass(execution.riskLevel)}>
                  {execution.riskLevel}
                </span>
              </div>

              <div className="execution-record-meta">
                <span>{execution.kind}</span>
                <span>status: {execution.status}</span>
                <span>approval: {isExplicitApprovalBoundary(execution) ? execution.approvalStatus : "receipt_only"}</span>
                <span>trust: {trustDomainLabel(execution)}</span>
              </div>

              <p className="execution-receipt-summary">
                {executionOutcomeLabel(execution)}: {executionSummary(execution)}
              </p>

              <dl className="execution-detail-grid">
                <div>
                  <dt>Requested by</dt>
                  <dd>{execution.whoRequested || "unknown"}</dd>
                </div>
                <div>
                  <dt>Chosen by</dt>
                  <dd>{execution.chosenByAgent || "unknown"}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{execution.linkedIds?.sessionId || "—"}</dd>
                </div>
                <div>
                  <dt>{execution.status === "running" ? "Started" : "Completed"}</dt>
                  <dd>
                    {formatDateTime(
                      execution.timestamps?.completedAt ||
                        execution.timestamps?.startedAt ||
                        execution.timestamps?.requestedAt,
                    )}
                  </dd>
                </div>
              </dl>

              {execution.providerResponseSummary &&
                execution.action !== "delegation.approve_task" && (
                  <p className="execution-provider-summary">
                    Provider: {execution.providerResponseSummary}
                  </p>
                )}

              {execution.errors?.length > 0 && (
                <p className="execution-error-summary">
                  Errors: {execution.errors.join("; ")}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default ExecutionReceiptsPanel;
