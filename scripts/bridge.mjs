#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "knowledge/bridge");
const statePath = path.join(dir, "tasks.json");
const lock = path.join(root, "work/bridge/state.lock");
const [command = "status", id, ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || args[i + 1] === undefined)
    throw new Error("Use --name value arguments.");
  flags[args[i].slice(2)] = args[i + 1];
}
const agents = ["codex", "claude", "human"];
function validAgent(a) {
  if (!agents.includes(a))
    throw new Error("Agent must be codex, claude, or human.");
  return a;
}
function resolveFile(p) {
  if (
    !p ||
    path.isAbsolute(p) ||
    p.split(/[\\/]/).includes("..") ||
    p.split(/[\\/]/).some(part => /^\.(env|dev\.vars)/i.test(part) || [".git", ".wrangler", ".sites-runtime", ".aws"].includes(part.toLowerCase()))
  )
    throw new Error("Use a project-relative, non-secret path.");
  const full = path.resolve(root, p);
  if (!full.startsWith(root + path.sep))
    throw new Error("Path leaves project.");
  let parent = full;
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (
    !fs.realpathSync(parent).startsWith(fs.realpathSync(root) + path.sep) &&
    parent !== root
  )
    throw new Error("Symlink leaves project.");
  return full;
}
// Conservative case folding keeps assignments portable across macOS and Linux.
// Resolve existing symlink parents as well as full files, including new files.
function fileKey(p) {
  const full = resolveFile(p);
  let parent = full;
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  return path.join(fs.realpathSync(parent), path.relative(parent, full)).toLowerCase();
}
const oneLine = value => String(value).replace(/\s+/g, ' ').replace(/[|`<>\[\]]/g, '');
const messageId = (m, i) => m.id || `legacy-${i + 1}`;
function snapshot(files) {
  const hash = crypto.createHash("sha256");
  for (const p of [...files].sort()) {
    const f = resolveFile(p);
    hash.update(p);
    if (fs.existsSync(f)) {
      if (!fs.statSync(f).isFile())
        throw new Error("File scopes must name files, not directories.");
      hash.update(fs.readFileSync(f));
    } else hash.update("(missing)");
  }
  return hash.digest("hex");
}
function read() {
  return fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { version: 1, tasks: [], messages: [] };
}
function write(s) {
  fs.mkdirSync(dir, { recursive: true });
  const temp = statePath + `.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(s, null, 2) + "\n");
  fs.renameSync(temp, statePath);
  render(s);
}
function render(s) {
  const rows = s.tasks
    .map(
      (t) =>
        `| ${t.id} | ${t.owner} | ${t.mode} | ${t.status} | ${oneLine(t.title)} |`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(dir, "Board.md.tmp"),
    `# Connected agent board\n\nGenerated after bridge updates. Read tasks with \`npm run bridge -- status\` and handoffs with \`npm run bridge -- inbox codex\` (or \`claude\`).\n\n| Task | Owner | Mode | Status | Objective |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Recent handoffs\n${s.messages
      .slice(-12)
      .map((m) => `- **${m.from} → ${m.to}** (${m.at}, ${m.readAt ? 'read' : 'unread'}): ${oneLine(m.message)}`)
      .join(
        "\n",
      )}\n\nSee [[Protocol]] for commands and [[../Build Status|Build Status]] for release state.\n`,
  );
  fs.renameSync(path.join(dir, "Board.md.tmp"), path.join(dir, "Board.md"));
}
function mutate(fn) {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try {
    fs.mkdirSync(lock);
  } catch {
    throw new Error(
      "Another bridge update is running. Retry shortly; never overwrite its lock.",
    );
  }
  try {
    const s = read();
    const result = fn(s);
    write(s);
    if (result) console.log(result);
  } finally {
    fs.rmdirSync(lock);
  }
}
function task(s) {
  const t = s.tasks.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown task: ${id}`);
  return t;
}
function assertOwner(t) {
  validAgent(flags.agent);
  if (t.owner !== flags.agent) throw new Error(`Task belongs to ${t.owner}.`);
}
function prompt(t) {
  return `Connected task ${t.id}: ${t.title}\n\nRead CLAUDE.md, knowledge/bridge/Protocol.md, and knowledge/Build Status.md.\nOwner: ${t.owner}. Mode: ${t.mode}.\nAllowed edit scope: ${t.mode === "review" ? "none (read-only)" : t.files.join(", ")}.\nDependencies: ${t.depends.join(", ") || "none"}.\n\n${t.brief}\n\nClaim first: node scripts/bridge.mjs claim ${t.id} --agent ${t.owner}\nDo not edit files owned by the other agent. Do not deploy, push, change credentials/settings, or spawn more agents.\nWhen finished, write findings/change summary and validation to knowledge/bridge/reports/${t.id}.md. Then run: node scripts/bridge.mjs complete ${t.id} --agent ${t.owner} --report knowledge/bridge/reports/${t.id}.md\nCompletion means ready for review, not accepted. If blocked, run: node scripts/bridge.mjs block ${t.id} --agent ${t.owner} --reason 'concrete blocker'\n`;
}
try {
  if (command === "status") {
    const s = read();
    console.log(
      s.tasks
        .map(
          (t) =>
            `${t.id.padEnd(24)} ${t.owner.padEnd(7)} ${t.status.padEnd(15)} ${t.title}`,
        )
        .join("\n") || "No tasks yet.",
    );
    for (const agent of agents) {
      const unread = s.messages.filter(m => m.to === agent && !m.readAt).length;
      if (unread) console.log(`${agent}: ${unread} unread handoff(s); run bridge inbox ${agent}`);
    }
  } else if (command === "inbox") {
    validAgent(id);
    const messages = read().messages.map((m,i) => ({...m, id:messageId(m,i)})).filter(m => m.to === id && !m.readAt);
    console.log(messages.length ? JSON.stringify(messages,null,2) : `No unread handoffs for ${id}.`);
  } else if (command === "ack") {
    mutate(s => {
      validAgent(flags.agent);
      const m = s.messages.find((m,i) => messageId(m,i) === id);
      if (!m || m.to !== flags.agent) throw new Error('Only the named recipient can acknowledge this handoff.');
      m.readAt = new Date().toISOString();
      return `Acknowledged ${id}.`;
    });
  } else if (command === "prompt") {
    console.log(prompt(task(read())));
  } else if (command === "add") {
    mutate((s) => {
      if (!/^[a-z0-9-]{3,60}$/.test(id) || s.tasks.some((t) => t.id === id))
        throw new Error(
          "Task ID must be unique lowercase letters, digits, and hyphens.",
        );
      const owner = validAgent(flags.owner),
        mode = flags.mode;
      if (!["edit", "review"].includes(mode))
        throw new Error("Mode must be edit or review.");
      const files = [...new Set((flags.files || "").split(",").filter(Boolean).map(p => path.relative(root, resolveFile(p))))];
      if (!files.length) throw new Error("Name the scoped files.");
      files.forEach(resolveFile);
      const depends = (flags.depends || "").split(",").filter(Boolean);
      if (depends.some((d) => !s.tasks.some((t) => t.id === d)))
        throw new Error("Dependency task not found.");
      if (!flags.title || !flags.brief)
        throw new Error("Provide --title and --brief.");
      s.tasks.push({
        id,
        owner,
        mode,
        files,
        depends,
        title: flags.title,
        brief: flags.brief,
        status: "queued",
        createdAt: new Date().toISOString(),
      });
      return `Queued ${id} for ${owner}.`;
    });
  } else if (command === "claim") {
    mutate((s) => {
      const t = task(s);
      assertOwner(t);
      if (t.status !== "queued" && t.status !== "blocked")
        throw new Error(`Cannot claim a ${t.status} task.`);
      if (
        t.depends.some(
          (d) => s.tasks.find((x) => x.id === d)?.status !== "accepted",
        )
      )
        throw new Error("Dependencies must be accepted first.");
      if (t.mode === "edit") {
        const conflict = s.tasks.find(
          (x) =>
            x.id !== t.id &&
            x.mode === "edit" &&
            x.startedAt && x.status !== "accepted" &&
            x.files.some((f) => t.files.some(p => fileKey(f) === fileKey(p))),
        );
        if (conflict)
          throw new Error(`Overlapping edit scope is owned by ${conflict.id}.`);
      }
      t.status = "active";
      t.startedAt = new Date().toISOString();
      t.startSnapshot = snapshot(t.files);
      delete t.blocker;
      return `Claimed ${id}. Stay inside its file scope.`;
    });
  } else if (command === "complete") {
    mutate((s) => {
      const t = task(s);
      assertOwner(t);
      if (t.status !== "active")
        throw new Error("Claim the task before completing it.");
      const report = resolveFile(flags.report);
      if (
        !flags.report.startsWith("knowledge/bridge/reports/") ||
        !fs.existsSync(report) ||
        fs.readFileSync(report, "utf8").trim().length < 30
      )
        throw new Error(
          "Write a nonempty report in knowledge/bridge/reports first.",
        );
      t.endSnapshot = snapshot(t.files);
      t.status =
        t.mode === "review" && t.startSnapshot !== t.endSnapshot
          ? "needs-refresh"
          : "review";
      t.report = flags.report;
      t.finishedAt = new Date().toISOString();
      return `${id}: ${t.status}. Independent verification is required.`;
    });
  } else if (command === "accept") {
    mutate((s) => {
      const t = task(s);
      validAgent(flags.agent);
      if (flags.agent === t.owner)
        throw new Error("A different agent must accept the result.");
      if (t.status !== "review")
        throw new Error("Only reviewed work can be accepted.");
      if (snapshot(t.files) !== t.endSnapshot)
        throw new Error(
          "Scoped files changed after the report. Re-review the current files.",
        );
      if (!flags.evidence || flags.evidence.length < 15)
        throw new Error("Include concrete verification evidence.");
      t.status = "accepted";
      t.acceptedBy = flags.agent;
      t.evidence = flags.evidence;
      t.acceptedAt = new Date().toISOString();
      return `Accepted ${id}.`;
    });
  } else if (command === "block") {
    mutate((s) => {
      const t = task(s);
      assertOwner(t);
      if (t.status !== "active")
        throw new Error("Only active work can be blocked.");
      if (!flags.reason) throw new Error("Give the blocker.");
      t.status = "blocked";
      t.blocker = flags.reason;
      return `Blocked ${id}: ${flags.reason}`;
    });
  } else if (command === "requeue") {
    mutate((s) => {
      const t = task(s);
      validAgent(flags.agent);
      if (!["blocked", "needs-refresh", "review"].includes(t.status))
        throw new Error("Only blocked or returned work can be requeued.");
      if (!flags.reason) throw new Error("Explain what needs another pass.");
      t.status = "queued";
      t.brief += `\nFollow-up from ${flags.agent}: ${flags.reason}`;
      return `Requeued ${id}.`;
    });
  } else if (command === "send") {
    mutate((s) => {
      const from = validAgent(id),
        to = validAgent(flags.to);
      if (!flags.message || flags.message.length > 8000)
        throw new Error("Message must contain 1–8000 characters.");
      s.messages.push({
        id: crypto.randomUUID(),
        from,
        to,
        message: flags.message,
        at: new Date().toISOString(),
      });
      return `Handoff saved for ${to}.`;
    });
  } else
    throw new Error(
      "Commands: status, inbox AGENT, ack MESSAGE_ID, add ID, prompt ID, claim ID, complete ID, accept ID, block ID, requeue ID, send AGENT. See knowledge/bridge/Protocol.md.",
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
