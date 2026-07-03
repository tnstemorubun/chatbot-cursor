require("dotenv").config();

const express = require("express");
const path = require("path");
const { tryLocalAgentAction, shouldSkipCursorApi, isLikelyAction } = require("./local-tools");
const { listWorkspaceTree, WORKSPACE_ROOT } = require("./workspace-agent");

const MODES = {
  agent: {
    label: "Agent",
    apiMode: "agent",
    local: true,
    buildPrompt: (message) => `[MODE: AGENT - LOKAL]
Tugas dieksekusi oleh agent lokal di server. Jawab singkat Bahasa Indonesia.

Tugas user:
${message}`,
  },
  plan: {
    label: "Plan",
    apiMode: "plan",
    local: false,
    buildPrompt: (message) => `[MODE: PLAN]
Kamu adalah perencana teknis. Buat rencana langkah demi langkah tanpa eksekusi kode.
Jawab Bahasa Indonesia, terstruktur.

Permintaan user:
${message}`,
  },
  debug: {
    label: "Debug",
    apiMode: "agent",
    local: true,
    buildPrompt: (message) => `[MODE: DEBUG]
Kamu adalah debugger. Analisis masalah, cari akar penyebab, usulkan perbaikan.
Jawab Bahasa Indonesia.

Masalah user:
${message}`,
  },
  multitask: {
    label: "Multitask",
    apiMode: "plan",
    local: true,
    buildPrompt: (message) => `[MODE: MULTITASK]
Kamu mengelola beberapa tugas sekaligus. Pecah jadi sub-tugas berurutan.
Jawab Bahasa Indonesia.

Daftar tugas user:
${message}`,
  },
  ask: {
    label: "Ask",
    apiMode: "plan",
    local: false,
    buildPrompt: (message) => `[MODE: ASK]
Kamu adalah asisten Q&A. Jawab pertanyaan secara langsung.
JANGAN mencari codebase. JANGAN memakai tools. Jawab Bahasa Indonesia.

Pertanyaan user:
${message}`,
  },
};

function resolveMode(mode) {
  return MODES[mode] ? mode : "ask";
}

function buildChatPrompt(message, mode) {
  return MODES[resolveMode(mode)].buildPrompt(message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.CURSOR_API_KEY;
const CURSOR_API = "https://api.cursor.com";
const DEFAULT_MODEL = "composer-2.5";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!API_KEY) {
  console.error("CURSOR_API_KEY belum diatur di file .env");
  process.exit(1);
}

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function cursorHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function cursorFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

async function waitForRunReady(agentId, runId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { response, data } = await cursorFetch(
      `${CURSOR_API}/v1/agents/${agentId}/runs/${runId}`,
      { headers: cursorHeaders() }
    );

    if (!response.ok) return data;

    if (data.status === "RUNNING" || data.status === "FINISHED") {
      return data;
    }

    if (["ERROR", "CANCELLED", "EXPIRED"].includes(data.status)) {
      return data;
    }

    await sleep(500);
  }

  return null;
}

async function waitForRunResult(agentId, runId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { response, data } = await cursorFetch(
      `${CURSOR_API}/v1/agents/${agentId}/runs/${runId}`,
      { headers: cursorHeaders() }
    );

    if (!response.ok) return null;

    if (data.result) return data.result;

    if (["ERROR", "CANCELLED", "EXPIRED"].includes(data.status)) {
      return null;
    }

    await sleep(1500);
  }

  return null;
}

app.get("/api/health", async (_req, res) => {
  try {
    const { response, data } = await cursorFetch(`${CURSOR_API}/v1/me`, {
      headers: cursorHeaders(),
    });

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || data?.message || "Gagal memverifikasi API key",
      });
    }

    res.json({
      ok: true,
      user: {
        name: [data.userFirstName, data.userLastName].filter(Boolean).join(" "),
        email: data.userEmail,
        apiKeyName: data.apiKeyName,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/modes", (_req, res) => {
  res.json({
    modes: Object.entries(MODES).map(([id, cfg]) => ({
      id,
      label: cfg.label,
    })),
  });
});

app.get("/api/workspace", async (_req, res) => {
  try {
    const tree = await listWorkspaceTree();
    res.json({ root: WORKSPACE_ROOT, files: tree });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body.message || "").trim();
  const agentId = req.body.agentId || null;
  const modeKey = resolveMode(req.body.mode);
  const modeConfig = MODES[modeKey];
  const promptText = buildChatPrompt(message, modeKey);
  const apiMode = modeConfig.apiMode;

  if (!message) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (event, payload) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    if (modeConfig.local) {
      const cursorDeps = {
        cursorFetch,
        cursorHeaders,
        CURSOR_API,
        DEFAULT_MODEL,
      };

      const localResult = await tryLocalAgentAction(message, modeKey, cursorDeps);
      if (localResult) {
        sendEvent("meta", {
          mode: modeKey,
          localAction: localResult.action,
          source: "workspace-agent",
        });
        sendEvent("action", localResult);
        sendEvent("delta", { text: localResult.message });
        if (localResult.reload) sendEvent("reload", {});
        if (localResult.url) sendEvent("navigate", { url: localResult.url });
        sendEvent("done", {});
        return res.end();
      }

      if (shouldSkipCursorApi(modeKey) && isLikelyAction(message)) {
        sendEvent("delta", {
          text: "Perintah tidak dikenali. Ketik `help` untuk panduan CRUD file & terminal.",
        });
        sendEvent("done", {});
        return res.end();
      }
    }

    let currentAgentId = agentId;
    let runId;
    let hasText = false;

    if (!currentAgentId) {
      const body = {
        prompt: { text: promptText },
        mode: apiMode,
        model: {
          id: DEFAULT_MODEL,
          params: [{ id: "fast", value: "true" }],
        },
      };

      const { response, data } = await cursorFetch(`${CURSOR_API}/v1/agents`, {
        method: "POST",
        headers: cursorHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        sendEvent("error", {
          message:
            data?.error?.message ||
            data?.message ||
            "Gagal membuat sesi chat",
          code: data?.error?.code || "create_agent_failed",
        });
        return res.end();
      }

      currentAgentId = data.agent?.id;
      runId = data.run?.id;
    } else {
      const { response, data } = await cursorFetch(
        `${CURSOR_API}/v1/agents/${currentAgentId}/runs`,
        {
          method: "POST",
          headers: cursorHeaders(),
          body: JSON.stringify({
            prompt: { text: promptText },
            mode: apiMode,
          }),
        }
      );

      if (!response.ok) {
        sendEvent("error", {
          message:
            data?.error?.message ||
            data?.message ||
            "Gagal mengirim pesan lanjutan",
          code: data?.error?.code || "create_run_failed",
        });
        return res.end();
      }

      runId = data.run?.id;
    }

    sendEvent("meta", { agentId: currentAgentId, runId, mode: modeKey });

    await waitForRunReady(currentAgentId, runId);

    const streamResponse = await fetch(
      `${CURSOR_API}/v1/agents/${currentAgentId}/runs/${runId}/stream`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "text/event-stream",
        },
      }
    );

    if (!streamResponse.ok) {
      const resultText = await waitForRunResult(currentAgentId, runId);
      if (resultText) {
        sendEvent("delta", { text: resultText });
        sendEvent("done", {});
        return res.end();
      }

      const text = await streamResponse.text();
      let errorData = null;

      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { message: text };
      }

      sendEvent("error", {
        message:
          errorData?.error?.message ||
          errorData?.message ||
          "Gagal membuka stream respons",
      });
      return res.end();
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamFailed = false;

    const handlePayload = (eventName, payload) => {
      if (eventName === "assistant" && payload.text) {
        hasText = true;
        sendEvent("delta", { text: payload.text });
        return;
      }

      if (eventName === "interaction_update") {
        return;
      }

      if (eventName === "result" && payload.text) {
        if (!hasText) {
          hasText = true;
          sendEvent("delta", { text: payload.text });
        }
        return;
      }

      if (eventName === "error") {
        streamFailed = true;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim()) continue;

        const lines = part.split("\n");
        let eventName = "message";
        let dataLine = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLine += line.slice(5).trim();
          }
        }

        if (!dataLine) continue;

        try {
          handlePayload(eventName, JSON.parse(dataLine));
        } catch {
          // Abaikan chunk SSE yang tidak valid
        }
      }
    }

    if (!hasText) {
      const resultText = await waitForRunResult(currentAgentId, runId);
      if (resultText) {
        sendEvent("delta", { text: resultText });
        hasText = true;
      }
    }

    if (!hasText && streamFailed) {
      sendEvent("error", {
        message: "Run stream tidak tersedia dan hasil run kosong",
      });
      return res.end();
    }

    sendEvent("done", {});
    res.end();
  } catch (error) {
    sendEvent("error", { message: error.message });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot berjalan di http://localhost:${PORT}`);
});
