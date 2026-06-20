import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ExecutionReceiptsPanel from "./ExecutionReceiptsPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flushPromises = () => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

function jsonResponse(payload) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}

describe("ExecutionReceiptsPanel approval smoke", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  it("renders pending explicit-boundary task approval and posts approval to the task endpoint", async () => {
    const pendingTask = {
      id: "task-approval-smoke",
      objective: "Smoke task awaiting approval",
      status: "pending_approval",
      parentAgent: "Elora",
      assignedAgent: "Nexora",
      requiredTools: ["gmail.send_email"],
      auditTrail: [],
      approvalRequirements: [{ required: true, status: "pending", reason: "external_commitment" }],
      policyBoundary: "external_commitment",
      trustDomain: "gmail",
      updatedAt: "2026-06-17T00:00:00.000Z",
    };
    const queuedTask = {
      ...pendingTask,
      status: "queued",
      approvalRequirements: [
        {
          required: true,
          status: "approved",
          reason: "external_commitment",
          approver: "user",
          approvedAt: "2026-06-17T00:01:00.000Z",
        },
      ],
    };

    const fetchMock = jest.spyOn(global, "fetch").mockImplementation((url) => {
      if (String(url).includes("/api/tasks/task-approval-smoke/approve")) {
        return jsonResponse({ task: queuedTask });
      }
      if (String(url).includes("/api/executions")) {
        return jsonResponse({ executions: [] });
      }
      if (String(url).includes("/api/tasks")) {
        return jsonResponse({ tasks: [pendingTask] });
      }
      throw new Error(`Unexpected smoke fetch: ${url}`);
    });

    await act(async () => {
      root = createRoot(container);
      root.render(<ExecutionReceiptsPanel sessionId="approval-smoke-session" />);
      await flushPromises();
    });

    const approveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Approve task",
    );
    expect(approveButton).toBeTruthy();
    expect(container.textContent).toContain("Task approval is pending before Nexora can start.");

    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const approvalCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/tasks/task-approval-smoke/approve"),
    );
    expect(approvalCall).toBeTruthy();
    expect(approvalCall[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(approvalCall[1].body)).toMatchObject({
      confirmedByUser: true,
      approver: "user",
      note: "Approved from execution receipts panel.",
    });
  });

  it("renders ordinary active and completed work as receipts without approval cards", async () => {
    const runningTask = {
      id: "ordinary-running",
      objective: "Run ordinary workspace validation",
      status: "running",
      parentAgent: "Elora",
      assignedAgent: "Nexora",
      requiredTools: ["run_command"],
      auditTrail: [{ event: "started" }],
      approvalRequirements: [],
      trustDomain: "commands",
      updatedAt: "2026-06-17T00:02:00.000Z",
    };
    const completedExecution = {
      id: "ordinary-completed",
      action: "code.create_file",
      kind: "tool_call",
      status: "completed",
      approvalStatus: "not_required",
      riskLevel: "write",
      trustDomain: "repository",
      policyAction: "execute",
      policyClassification: "execute_with_receipt",
      receipt: { summary: "code.create_file completed" },
      timestamps: { requestedAt: "2026-06-17T00:03:00.000Z", completedAt: "2026-06-17T00:03:01.000Z" },
      linkedIds: { sessionId: "ordinary-session" },
      errors: [],
    };

    jest.spyOn(global, "fetch").mockImplementation((url) => {
      if (String(url).includes("/api/executions")) {
        return jsonResponse({ executions: [completedExecution] });
      }
      if (String(url).includes("/api/tasks")) {
        return jsonResponse({ tasks: [runningTask] });
      }
      throw new Error(`Unexpected ordinary fetch: ${url}`);
    });

    await act(async () => {
      root = createRoot(container);
      root.render(<ExecutionReceiptsPanel sessionId="ordinary-session" />);
      await flushPromises();
    });

    expect(container.textContent).toContain("Active execution");
    expect(container.textContent).toContain("Trust domain: commands");
    expect(container.textContent).toContain("Completed receipt: code.create_file completed");
    expect(container.textContent).toContain("trust: repository");
    expect(container.textContent).not.toContain("Approve task");
    expect(container.textContent).not.toContain("Approve step");
  });
});
