const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const WORKSPACE_ROOT = path.resolve(__dirname);
const PUBLIC_DIR = path.join(WORKSPACE_ROOT, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");
const EXEC_TIMEOUT = 120000;
const IGNORE_DIRS = new Set(["node_modules", ".git", ".playwright-cli"]);

const THEMES = {
  "chat-dark": {
    bg: "#0b0f14",
    bodyBackground:
      "radial-gradient(circle at top left, rgba(56, 189, 248, 0.12), transparent 30%), radial-gradient(circle at bottom right, rgba(110, 231, 183, 0.1), transparent 28%), #0b0f14",
    label: "dark seperti body chat",
  },
  merah: {
    bg: "#7f1d1d",
    bodyBackground: "linear-gradient(160deg, #7f1d1d 0%, #1a0505 45%, #7f1d1d 100%)",
    label: "merah",
  },
  biru: {
    bg: "#1e3a8a",
    bodyBackground: "linear-gradient(160deg, #1e3a8a 0%, #0f172a 45%, #1e3a8a 100%)",
    label: "biru",
  },
  pink: {
    bg: "#831843",
    bodyBackground: "linear-gradient(160deg, #db2777 0%, #831843 45%, #500724 100%)",
    label: "pink",
  },
  hijau: {
    bg: "#14532d",
    bodyBackground: "linear-gradient(160deg, #16a34a 0%, #14532d 45%, #052e16 100%)",
    label: "hijau",
  },
  kuning: {
    bg: "#854d0e",
    bodyBackground: "linear-gradient(160deg, #eab308 0%, #854d0e 45%, #422006 100%)",
    label: "kuning",
  },
  ungu: {
    bg: "#581c87",
    bodyBackground: "linear-gradient(160deg, #a855f7 0%, #581c87 45%, #3b0764 100%)",
    label: "ungu",
  },
  putih: {
    bg: "#f8fafc",
    bodyBackground: "linear-gradient(160deg, #f8fafc 0%, #e2e8f0 45%, #cbd5e1 100%)",
    label: "putih",
  },
  hitam: {
    bg: "#020617",
    bodyBackground: "linear-gradient(160deg, #0f172a 0%, #020617 45%, #000000 100%)",
    label: "hitam",
  },
  orange: {
    bg: "#9a3412",
    bodyBackground: "linear-gradient(160deg, #f97316 0%, #9a3412 45%, #431407 100%)",
    label: "orange",
  },
};

function resolveSafePath(inputPath = "") {
  const cleaned = String(inputPath).trim().replace(/^["'`]|["'`]$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "/") return WORKSPACE_ROOT;

  const normalized = cleaned.replace(/\\/g, "/").replace(/^\//, "");
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);

  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Path di luar workspace: ${inputPath}`);
  }

  return resolved;
}

function toRelative(absPath) {
  return path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/") || ".";
}

async function listWorkspaceTree(dir = WORKSPACE_ROOT, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const lines = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    const rel = toRelative(full);
    lines.push(entry.isDirectory() ? `${rel}/` : rel);

    if (entry.isDirectory() && depth < maxDepth) {
      const children = await listWorkspaceTree(full, depth + 1, maxDepth);
      lines.push(...children);
    }
  }

  return lines;
}

async function toolList(targetPath = ".") {
  const abs = resolveSafePath(targetPath);
  const stat = await fs.stat(abs);

  if (stat.isFile()) {
    return { type: "file", path: toRelative(abs), size: stat.size };
  }

  const items = await fs.readdir(abs, { withFileTypes: true });
  return {
    type: "directory",
    path: toRelative(abs),
    items: items
      .filter((e) => !IGNORE_DIRS.has(e.name))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "dir" : "file",
      })),
  };
}

async function toolRead(filePath) {
  const abs = resolveSafePath(filePath);
  const content = await fs.readFile(abs, "utf8");
  return { path: toRelative(abs), content };
}

async function toolWrite(filePath, content, append = false) {
  const abs = resolveSafePath(filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });

  if (append) {
    await fs.appendFile(abs, content, "utf8");
  } else {
    await fs.writeFile(abs, content, "utf8");
  }

  return { path: toRelative(abs), bytes: Buffer.byteLength(content, "utf8") };
}

async function toolDelete(targetPath) {
  const abs = resolveSafePath(targetPath);
  const stat = await fs.stat(abs);

  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }

  return { path: toRelative(abs), deleted: true };
}

async function toolMkdir(dirPath) {
  const abs = resolveSafePath(dirPath);
  await fs.mkdir(abs, { recursive: true });
  return { path: toRelative(abs), created: true };
}

async function toolExec(command) {
  const cmd = String(command).trim();
  if (!cmd) throw new Error("Perintah terminal kosong");

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: WORKSPACE_ROOT,
      timeout: EXEC_TIMEOUT,
      maxBuffer: 1024 * 1024 * 5,
      windowsHide: true,
      shell: true,
    });

    return {
      command: cmd,
      cwd: toRelative(WORKSPACE_ROOT),
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: 0,
    };
  } catch (error) {
    return {
      command: cmd,
      cwd: toRelative(WORKSPACE_ROOT),
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "",
      exitCode: error.code ?? 1,
    };
  }
}

async function executeAction(action) {
  const tool = action.tool || action.type;

  switch (tool) {
    case "read":
      return { tool, result: await toolRead(action.path) };
    case "write":
      return {
        tool,
        result: await toolWrite(action.path, action.content || "", action.append),
      };
    case "delete":
      return { tool, result: await toolDelete(action.path) };
    case "list":
      return { tool, result: await toolList(action.path || ".") };
    case "mkdir":
      return { tool, result: await toolMkdir(action.path) };
    case "exec":
    case "terminal":
    case "run":
      return { tool: "exec", result: await toolExec(action.command) };
    default:
      throw new Error(`Tool tidak dikenal: ${tool}`);
  }
}

async function executeActions(actions) {
  const results = [];
  for (const action of actions) {
    results.push(await executeAction(action));
  }
  return results;
}

function formatResults(results) {
  return results
    .map((item) => {
      const r = item.result;
      switch (item.tool) {
        case "read":
          return `📄 READ ${r.path}\n${r.content.slice(0, 2000)}${r.content.length > 2000 ? "\n...(truncated)" : ""}`;
        case "write":
          return `✏️ WRITE ${r.path} (${r.bytes} bytes)`;
        case "delete":
          return `🗑️ DELETE ${r.path}`;
        case "mkdir":
          return `📁 MKDIR ${r.path}`;
        case "list": {
          if (r.type === "file") return `📄 FILE ${r.path} (${r.size} bytes)`;
          const names = r.items.map((i) => `${i.type === "dir" ? "📁" : "📄"} ${i.name}`).join("\n");
          return `📂 LIST ${r.path}\n${names}`;
        }
        case "exec":
          return `💻 EXEC: ${r.command} (exit ${r.exitCode})\n${r.stdout ? `stdout:\n${r.stdout}` : ""}${r.stderr ? `\nstderr:\n${r.stderr}` : ""}`.trim();
        default:
          return JSON.stringify(r, null, 2);
      }
    })
    .join("\n\n");
}

function extractCodeBlocks(message) {
  const blocks = [];
  const regex = /```(?:[\w-]+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(message)) !== null) {
    blocks.push(match[1].trimEnd());
  }
  return blocks;
}

function parseDirectCommands(message) {
  const text = message.trim();
  const lower = text.toLowerCase();
  const actions = [];

  const execMatch =
    text.match(/^(?:jalankan|run|exec|terminal|cmd)\s*[:：]?\s*(.+)$/i) ||
    text.match(/^`(.+)`$/);

  if (execMatch) {
    actions.push({ tool: "exec", command: execMatch[1].trim() });
    return actions;
  }

  if (/^(ls|dir|list|daftar)\s*(file|folder|direktori)?/i.test(lower)) {
    const pathMatch = text.match(/(?:di|in|folder)\s+(.+)$/i);
    actions.push({ tool: "list", path: pathMatch ? pathMatch[1].trim() : "." });
    return actions;
  }

  const readMatch = text.match(
    /^(?:baca|read|lihat|tampilkan)\s+(?:file\s+)?(.+?)(?:\s*$)/i
  );
  if (readMatch) {
    actions.push({ tool: "read", path: readMatch[1].trim() });
    return actions;
  }

  const deleteMatch = text.match(/^(?:hapus|delete|remove)\s+(?:file\s+)?(.+)$/i);
  if (deleteMatch) {
    actions.push({ tool: "delete", path: deleteMatch[1].trim() });
    return actions;
  }

  const mkdirMatch = text.match(/^(?:buat|bikin|create)\s+(?:folder|direktori|dir)\s+(.+)$/i);
  if (mkdirMatch) {
    actions.push({ tool: "mkdir", path: mkdirMatch[1].trim() });
    return actions;
  }

  const writeFileMatch = text.match(
    /^(?:buat|bikin|create|tulis|write)\s+(?:file\s+)?["']?([^\s"']+)["']?(?:\s+dengan\s+isi|\s+isi)?\s*:?\s*/i
  );
  if (writeFileMatch) {
    const blocks = extractCodeBlocks(message);
    const inlineContent = text.slice(writeFileMatch[0].length).trim();
    const content = blocks[0] || inlineContent;
    if (content) {
      actions.push({ tool: "write", path: writeFileMatch[1].trim(), content });
      return actions;
    }
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.actions)) return parsed.actions;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // lanjut
    }
  }

  return actions;
}

function extractActionsFromAiText(text) {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]);
      if (Array.isArray(parsed.actions)) return parsed.actions;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // lanjut
    }
  }

  const rawJson = text.match(/\{\s*"actions"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (rawJson) {
    try {
      return JSON.parse(rawJson[0]).actions;
    } catch {
      // lanjut
    }
  }

  return null;
}

async function changeWebBackground(theme) {
  let html = await fs.readFile(INDEX_FILE, "utf8");
  html = html.replace(/--bg:\s*[^;]+;/, `--bg: ${theme.bg};`);
  html = html.replace(
    /body\s*\{[^}]*background:\s*[^;]+;/s,
    (block) => block.replace(/background:\s*[^;]+;/, `background: ${theme.bodyBackground};`)
  );
  await fs.writeFile(INDEX_FILE, html, "utf8");
  return {
    action: "change_background",
    message: `✅ Background diubah ke ${theme.label}. Refresh halaman.`,
    reload: true,
  };
}

function resolveTheme(message) {
  const text = message.toLowerCase();

  if (/dark|gelap|seperti\s+(body|chat|panel)|body\s+chat/i.test(text)) {
    return THEMES["chat-dark"];
  }

  const colorOrder = [
    "pink",
    "merah",
    "biru",
    "hijau",
    "kuning",
    "ungu",
    "orange",
    "putih",
    "hitam",
  ];

  for (const key of colorOrder) {
    if (text.includes(key)) return THEMES[key];
  }

  const hexMatch = text.match(/#(?:[0-9a-f]{3}){1,2}\b/i);
  if (hexMatch) {
    const hex = hexMatch[0];
    return {
      bg: hex,
      bodyBackground: `linear-gradient(160deg, ${hex} 0%, #0f172a 45%, ${hex} 100%)`,
      label: hex,
    };
  }

  return null;
}

function isListFilesIntent(message) {
  const lower = message.toLowerCase();
  return /(?:ada\s+)?file\s+apa|daftar\s+file|isi\s+folder|file\s+(?:apa|ada)|folder\s+(?:ini|apa|berisi)|tampilkan\s+(?:semua\s+)?file|lihat\s+(?:isi\s+)?(?:folder|direktori)|apa\s+saja\s+(?:file|isi)|mau\s+tahu\s+ada\s+file/i.test(
    lower
  );
}

function isBackgroundChangeIntent(message) {
  return /(ubah|ganti|set|change).*(bg|background|warna|tema|latar|halaman)/i.test(message) ||
    /(bg|background|warna|tema|latar).*(ubah|ganti|menjadi|jadi|ke)/i.test(message);
}

function extractListPath(message) {
  const lower = message.toLowerCase();
  if (/folder\s+ini|direktori\s+ini|di\s+sini|workspace\s+ini|folde\s+ini/i.test(lower)) {
    return ".";
  }

  const explicit = message.match(/(?:di|dalam)\s+(?:folder|direktori)\s+([a-zA-Z0-9_./-]+)/i);
  if (explicit) return explicit[1].trim();

  const shortPath = message.match(/(?:di|dalam)\s+([a-zA-Z0-9_./-]{2,})/i);
  if (shortPath && !/^(ini|folde|folder|sini)$/i.test(shortPath[1])) {
    return shortPath[1].trim();
  }

  return ".";
}

function parseNaturalIntent(message) {
  const text = message.trim();
  const lower = text.toLowerCase();
  const actions = [];

  if (isListFilesIntent(message)) {
    actions.push({ tool: "list", path: extractListPath(message) });
    return actions;
  }

  const readNatural = text.match(
    /(?:baca|lihat|tampilkan|apa\s+isi)\s+(?:file\s+)?["']?([^\s?"']+)["']?/i
  );
  if (readNatural) {
    actions.push({ tool: "read", path: readNatural[1].trim() });
    return actions;
  }

  const deleteNatural = text.match(/(?:hapus|delete|remove)\s+(?:file\s+)?["']?([^\s?"']+)["']?/i);
  if (deleteNatural) {
    actions.push({ tool: "delete", path: deleteNatural[1].trim() });
    return actions;
  }

  if (/(?:jalankan|run|exec|terminal)\s+(.+)/i.test(lower)) {
    const cmd = text.match(/(?:jalankan|run|exec|terminal)\s*[:：]?\s*(.+)$/i);
    if (cmd) {
      actions.push({ tool: "exec", command: cmd[1].trim() });
      return actions;
    }
  }

  return actions;
}

function buildSnakeGameHtml() {
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"/><title>Snake Game</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font-family:sans-serif}canvas{border:2px solid #334155;border-radius:12px;background:#020617}</style>
</head><body data-testid="snake-page"><h1>🐍 Snake Game</h1><canvas id="b" width="400" height="400" data-testid="snake-canvas"></canvas>
<p><a href="/">← Chatbot</a></p>
<script>
const c=document.getElementById("b"),x=c.getContext("2d"),s=20;
let sn=[{x:10,y:10}],d={x:1,y:0},f={x:15,y:15},sc=0;
function rf(){f={x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)}}
function dr(){x.fillStyle="#020617";x.fillRect(0,0,400,400);x.fillStyle="#22c55e";sn.forEach(p=>x.fillRect(p.x*s,p.y*s,s-1,s-1));x.fillStyle="#ef4444";x.fillRect(f.x*s,f.y*s,s-1,s-1)}
function tk(){const h={x:sn[0].x+d.x,y:sn[0].y+d.y};if(h.x<0||h.y<0||h.x>=20||h.y>=20||sn.some(p=>p.x===h.x&&p.y===h.y))return;sn.unshift(h);if(h.x===f.x&&h.y===f.y){sc++;rf()}else sn.pop();dr()}
document.addEventListener("keydown",e=>{if(e.key==="ArrowUp"&&d.y!==1)d={x:0,y:-1};if(e.key==="ArrowDown"&&d.y!==-1)d={x:0,y:1};if(e.key==="ArrowLeft"&&d.x!==1)d={x:-1,y:0};if(e.key==="ArrowRight"&&d.x!==-1)d={x:1,y:0}});
dr();setInterval(tk,120);
</script></body></html>`;
}

async function buildAiPlannerPrompt(message, tree) {
  return `[WORKSPACE AGENT - EKSEKUSI LOKAL]
Kamu mengontrol workspace di: ${WORKSPACE_ROOT}
User punya akses penuh CRUD file + terminal di dalam folder ini.

File workspace:
${tree.slice(0, 80).join("\n")}

TOOLS yang bisa dieksekusi server:
- read: { "tool": "read", "path": "rel/path" }
- write: { "tool": "write", "path": "rel/path", "content": "..." }
- delete: { "tool": "delete", "path": "rel/path" }
- list: { "tool": "list", "path": "." }
- mkdir: { "tool": "mkdir", "path": "folder/name" }
- exec: { "tool": "exec", "command": "npm install" }

WAJIB jawab HANYA dengan blok JSON ini (tanpa penjelasan lain):
\`\`\`json
{ "actions": [ ... ] }
\`\`\`

Permintaan user:
${message}`;
}

async function planWithCursor(message, tree, cursorFetch, cursorHeaders, CURSOR_API, DEFAULT_MODEL) {
  const prompt = await buildAiPlannerPrompt(message, tree);

  const { response, data } = await cursorFetch(`${CURSOR_API}/v1/agents`, {
    method: "POST",
    headers: cursorHeaders(),
    body: JSON.stringify({
      prompt: { text: prompt },
      mode: "plan",
      model: { id: DEFAULT_MODEL, params: [{ id: "fast", value: "true" }] },
    }),
  });

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || "Gagal merencanakan aksi");
  }

  const agentId = data.agent?.id;
  const runId = data.run?.id;

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data: runData } = await cursorFetch(
      `${CURSOR_API}/v1/agents/${agentId}/runs/${runId}`,
      { headers: cursorHeaders() }
    );
    if (runData?.result) return runData.result;
    if (["ERROR", "CANCELLED", "EXPIRED"].includes(runData?.status)) break;
  }

  return null;
}

function isLikelyAction(message) {
  const text = message.toLowerCase().trim();
  if (text === "help" || text === "bantuan" || text === "?") return true;
  if (isListFilesIntent(message) || isBackgroundChangeIntent(message)) return true;
  return /(jalankan|run|exec|terminal|cmd|baca|read|hapus|delete|remove|buat|bikin|tulis|write|create|list|ls|dir|ubah|ganti|npm|node|git|npx|file|folder|snake|ular|bg|background|warna|tema|```|json|mkdir|install|pink|merah|biru|hijau|ungu|kuning|orange|halaman|isi)/i.test(
    text
  );
}

function isWorkspaceActionMode(mode) {
  return ["agent", "debug", "multitask"].includes(mode);
}

async function runWorkspaceAgent(message, mode, cursorDeps = null) {
  if (!isWorkspaceActionMode(mode)) return null;

  const text = message.trim();
  if (text.toLowerCase() === "help" || text.toLowerCase() === "bantuan" || text === "?") {
    return buildHelpResponse();
  }

  if (!isLikelyAction(message)) return null;

  try {
    const directActions = parseDirectCommands(message);
    if (directActions.length > 0) {
      const results = await executeActions(directActions);
      return buildActionResponse(results, directActions);
    }

    const naturalActions = parseNaturalIntent(message);
    if (naturalActions.length > 0) {
      const results = await executeActions(naturalActions);
      return buildActionResponse(results, naturalActions);
    }

    if (/ular|snake/i.test(message) && /buat|bikin|create|game/i.test(message)) {
      await toolWrite("public/snake.html", buildSnakeGameHtml());
      return {
        action: "create_snake_game",
        message: "✅ Halaman snake.html dibuat.\nBuka: /snake.html",
        url: "/snake.html",
      };
    }

    if (isBackgroundChangeIntent(message)) {
      const theme = resolveTheme(message);
      if (theme) return changeWebBackground(theme);
      return {
        action: "error",
        message:
          "❌ Warna tidak dikenali. Coba: pink, merah, biru, hijau, kuning, ungu, orange, putih, hitam, atau #hex.",
      };
    }

    if (cursorDeps) {
      const tree = await listWorkspaceTree();
      const aiText = await planWithCursor(
        message,
        tree,
        cursorDeps.cursorFetch,
        cursorDeps.cursorHeaders,
        cursorDeps.CURSOR_API,
        cursorDeps.DEFAULT_MODEL
      );

      if (aiText) {
        const actions = extractActionsFromAiText(aiText);
        if (actions?.length) {
          const results = await executeActions(actions);
          return buildActionResponse(results, actions, "workspace_ai_actions");
        }
      }
    }

    if (isListFilesIntent(message)) {
      const results = await executeActions([{ tool: "list", path: "." }]);
      return buildActionResponse(results, [{ tool: "list", path: "." }]);
    }

    return buildHelpResponse();
  } catch (error) {
    return {
      action: "error",
      message: `❌ Error agent lokal: ${error.message}`,
    };
  }
}

function buildActionResponse(results, actions, actionName = "workspace_crud") {
  return {
    action: actionName,
    message: `✅ Agent lokal mengeksekusi ${results.length} aksi:\n\n${formatResults(results)}`,
    results,
    reload: actions.some((a) => a.path?.includes("index.html") || a.tool === "write"),
  };
}

function buildHelpResponse() {
  return {
    action: "help",
    message: `🛠️ **Agent Workspace** — akses penuh di folder proyek ini.

**Bahasa natural (langsung dieksekusi):**
• ada file apa di folder ini?
• ubah warna bg menjadi pink
• baca file server.js

**Terminal:**
• jalankan: npm start
• exec: dir

**File CRUD:**
• hapus file public/snake.html
• buat file public/test.html dengan isi:
\`\`\`html
<h1>Hello</h1>
\`\`\`

**JSON batch:**
\`\`\`json
{ "actions": [
  { "tool": "write", "path": "public/demo.html", "content": "<h1>Demo</h1>" },
  { "tool": "exec", "command": "dir public" }
]}
\`\`\``,
  };
}

module.exports = {
  runWorkspaceAgent,
  isWorkspaceActionMode,
  isLikelyAction,
  listWorkspaceTree,
  executeActions,
  parseDirectCommands,
  resolveSafePath,
  WORKSPACE_ROOT,
};
