import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
test("bridge enforces ownership, independent acceptance, and stale-review protection", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connected-bridge-"));
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(
      new URL("../scripts/bridge.mjs", import.meta.url),
      path.join(root, "scripts/bridge.mjs"),
    );
    fs.writeFileSync(path.join(root, "source.ts"), "export const value=1;");
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [path.join(root, "scripts/bridge.mjs"), ...args],
        { encoding: "utf8" },
      );
    const add = (id: string, owner: string, mode: string) =>
      run(
        "add",
        id,
        "--owner",
        owner,
        "--mode",
        mode,
        "--files",
        "source.ts",
        "--title",
        "Scoped task",
        "--brief",
        "Verify the source.",
      );
    assert.equal(add("first-edit", "codex", "edit").status, 0);
    assert.equal(add("second-edit", "claude", "edit").status, 0);
    assert.notEqual(run("claim", "first-edit", "--agent", "claude").status, 0);
    assert.equal(run("claim", "first-edit", "--agent", "codex").status, 0);
    assert.match(
      run("claim", "second-edit", "--agent", "claude").stderr,
      /Overlapping edit scope/,
    );
    fs.mkdirSync(path.join(root, "knowledge/bridge/reports"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "knowledge/bridge/reports/report.md"),
      "Reviewed source and checked behavior. Meaningful evidence is recorded here.",
    );
    assert.equal(
      run(
        "complete",
        "first-edit",
        "--agent",
        "codex",
        "--report",
        "knowledge/bridge/reports/report.md",
      ).status,
      0,
    );
    assert.notEqual(
      run(
        "accept",
        "first-edit",
        "--agent",
        "codex",
        "--evidence",
        "Checked all expected behavior.",
      ).status,
      0,
    );
    assert.equal(
      run(
        "accept",
        "first-edit",
        "--agent",
        "claude",
        "--evidence",
        "Checked all expected behavior.",
      ).status,
      0,
    );
    assert.equal(add("source-review", "claude", "review").status, 0);
    assert.equal(run("claim", "source-review", "--agent", "claude").status, 0);
    fs.writeFileSync(path.join(root, "source.ts"), "export const value=2;");
    assert.equal(
      run(
        "complete",
        "source-review",
        "--agent",
        "claude",
        "--report",
        "knowledge/bridge/reports/report.md",
      ).status,
      0,
    );
    const state = JSON.parse(
      fs.readFileSync(path.join(root, "knowledge/bridge/tasks.json"), "utf8"),
    );
    assert.equal(
      state.tasks.find((t: { id: string }) => t.id === "source-review").status,
      "needs-refresh",
    );
    assert.notEqual(
      run(
        "accept",
        "source-review",
        "--agent",
        "codex",
        "--evidence",
        "Checked all expected behavior.",
      ).status,
      0,
    );
    assert.notEqual(
      run(
        "add",
        "bad-path",
        "--owner",
        "codex",
        "--mode",
        "edit",
        "--files",
        "../outside",
        "--title",
        "Bad scope",
        "--brief",
        "Must fail.",
      ).status,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("bridge retains paused ownership, detects aliases, rejects secret scopes, and tracks handoffs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connected-bridge-rules-"));
  try {
    fs.mkdirSync(path.join(root,"scripts"));
    fs.copyFileSync(new URL("../scripts/bridge.mjs",import.meta.url),path.join(root,"scripts/bridge.mjs"));
    fs.writeFileSync(path.join(root,"source.ts"),"test");
    fs.symlinkSync("source.ts",path.join(root,"alias.ts"));
    const run = (...args:string[]) => spawnSync(process.execPath,[path.join(root,"scripts/bridge.mjs"),...args],{encoding:"utf8"});
    const add = (id:string,file:string) => run("add",id,"--owner","codex","--mode","edit","--files",file,"--title","Check scope","--brief","Test ownership");
    assert.equal(add("held-task","source.ts").status,0);
    assert.equal(run("claim","held-task","--agent","codex").status,0);
    for (const [id,file] of [["alias-task","alias.ts"],["case-task","Source.ts"]]) {
      assert.equal(add(id,file).status,0);
      assert.match(run("claim",id,"--agent","codex").stderr,/Overlapping edit scope/);
    }
    assert.equal(run("block","held-task","--agent","codex","--reason","Waiting on review").status,0);
    assert.match(run("claim","alias-task","--agent","codex").stderr,/Overlapping edit scope/);
    assert.equal(run("requeue","held-task","--agent","claude","--reason","Resume changes").status,0);
    assert.match(run("claim","alias-task","--agent","codex").stderr,/Overlapping edit scope/);
    assert.equal(run("claim","held-task","--agent","codex").status,0);
    for (const [i,file] of ["sub/.env.local","sub/.dev.vars",".wrangler/state/db.sqlite","./.git/config"].entries()) assert.notEqual(add(`secret-${i}`,file).status,0);
    assert.equal(run("send","claude","--to","codex","--message","First line\n## Fake heading\n| Fake table |").status,0);
    const inbox=JSON.parse(run("inbox","codex").stdout);assert.equal(inbox.length,1);
    const board=fs.readFileSync(path.join(root,"knowledge/bridge/Board.md"),"utf8");assert.ok(!board.includes("\n## Fake heading"));
    assert.notEqual(run("ack",inbox[0].id,"--agent","claude").status,0);
    assert.equal(run("ack",inbox[0].id,"--agent","codex").status,0);
    assert.match(run("inbox","codex").stdout,/No unread handoffs/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
