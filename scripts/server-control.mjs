import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

const args = process.argv.slice(2);
const command = args[0] ?? "start";
const optionArgs = args.slice(1);

const getArgValue = (name) => {
  const index = optionArgs.findIndex((arg) => arg === name);
  if (index === -1) {
    return null;
  }
  return optionArgs[index + 1] ?? null;
};

const port = Number(getArgValue("--port") ?? process.env.PORT ?? "4173");
const shouldOpen = optionArgs.includes("--open");

if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid port: ${String(port)}`);
  process.exit(1);
}

const serverScript = path.join(projectDir, "scripts", "serve-dist.mjs");
const distDir = path.join(projectDir, "dist");
const url = `http://127.0.0.1:${port}`;
const healthUrl = `${url}/health`;
const pidFile = path.join(os.tmpdir(), `trt-server-${port}.pid`);
const legacyPidFile = port === 4173 ? path.join(os.tmpdir(), "trt-server.pid") : "";
const logFile = path.join(os.tmpdir(), `trt-server-${port}.log`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readPid = () => {
  const candidates = [pidFile, legacyPidFile].filter(Boolean);
  for (const file of candidates) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) {
      continue;
    }
    const pid = Number(raw);
    if (Number.isFinite(pid)) {
      return pid;
    }
  }
  return null;
};

const checkHealth = (timeoutMs = 2000) =>
  new Promise((resolve) => {
    const request = http.get(healthUrl, { timeout: timeoutMs }, (response) => {
      const ok = response.statusCode === 200;
      response.resume();
      resolve(ok);
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });

const waitForHealth = async (attempts = 30, delayMs = 500) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await checkHealth()) {
      return true;
    }
    await sleep(delayMs);
  }
  return false;
};

const openInBrowser = (targetUrl) => {
  const options = { detached: true, stdio: "ignore", windowsHide: true };
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", targetUrl], options).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [targetUrl], options).unref();
    return;
  }
  spawn("xdg-open", [targetUrl], options).unref();
};

const startServer = async () => {
  if (!fs.existsSync(serverScript)) {
    console.error(`Server script missing: ${serverScript}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.error("Build output missing. Run `npm run build` first.");
    process.exit(1);
  }

  const existingPid = readPid();
  const existingPidAlive = existingPid ? processAlive(existingPid) : false;
  const healthyBeforeStart = await checkHealth();
  if (existingPid && existingPidAlive && healthyBeforeStart) {
    console.log(`Server already running on ${url}`);
    if (shouldOpen) {
      openInBrowser(url);
    }
    return;
  }
  if ((!existingPid || !existingPidAlive) && healthyBeforeStart) {
    console.log(`Server already running on ${url} (external process)`);
    if (shouldOpen) {
      openInBrowser(url);
    }
    return;
  }

  if (existingPid && existingPidAlive) {
    try {
      process.kill(existingPid, "SIGTERM");
    } catch {
      // Ignore termination failures for stale process.
    }
    await sleep(500);
  }

  try {
    fs.rmSync(pidFile, { force: true });
    if (legacyPidFile) {
      fs.rmSync(legacyPidFile, { force: true });
    }
  } catch {
    // Ignore cleanup failures.
  }

  const outFd = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [serverScript, "--port", String(port), "--root", distDir], {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    windowsHide: true
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));

  const healthy = await waitForHealth();
  if (!healthy) {
    console.error(`Server did not become healthy on ${healthUrl}`);
    try {
      const tail = fs.readFileSync(logFile, "utf8").split(/\r?\n/).slice(-40).join("\n");
      if (tail.trim()) {
        console.error(tail);
      }
    } catch {
      // Ignore log read errors.
    }
    process.exit(1);
  }

  console.log(`Server running on ${url}`);
  if (shouldOpen) {
    openInBrowser(url);
  }
};

const stopServer = async () => {
  const existingPid = readPid();
  const existingPidAlive = existingPid ? processAlive(existingPid) : false;
  if (existingPid && existingPidAlive) {
    try {
      process.kill(existingPid, "SIGTERM");
    } catch {
      // Ignore termination failures.
    }

    for (let index = 0; index < 20; index += 1) {
      if (!processAlive(existingPid)) {
        break;
      }
      await sleep(100);
    }

    if (processAlive(existingPid)) {
      try {
        process.kill(existingPid, "SIGKILL");
      } catch {
        // Ignore hard-kill failures.
      }
    }
  }

  try {
    fs.rmSync(pidFile, { force: true });
    if (legacyPidFile) {
      fs.rmSync(legacyPidFile, { force: true });
    }
  } catch {
    // Ignore cleanup failures.
  }

  if (await checkHealth()) {
    console.log("Server still running (external process not managed by this controller)");
    process.exitCode = 1;
    return;
  }

  console.log("Server stopped");
};

const printStatus = async () => {
  const existingPid = readPid();
  const existingPidAlive = existingPid ? processAlive(existingPid) : false;
  const healthy = await checkHealth();
  if (existingPid && existingPidAlive && healthy) {
    console.log(`running pid=${existingPid} url=${url}`);
    return;
  }
  if ((!existingPid || !existingPidAlive) && healthy) {
    console.log(`running pid=unknown url=${url} (external process)`);
    return;
  }
  console.log("stopped");
  process.exitCode = 1;
};

const main = async () => {
  if (command === "start") {
    await startServer();
    return;
  }
  if (command === "stop") {
    await stopServer();
    return;
  }
  if (command === "status") {
    await printStatus();
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error("Usage: node scripts/server-control.mjs <start|stop|status> [--port 4173] [--open]");
  process.exit(1);
};

await main();
