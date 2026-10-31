import { randomBytes } from "node:crypto";
import {
  existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const APP_SETTINGS = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "DEEPGRAM_API_KEY", "TAVUS_API_KEY", "TAVUS_PAL_ID",
]);
const DEFAULTS = Object.freeze({
  LLM_ADAPTER: "mock", VOICE_INPUT_ENABLED: "false", TAVUS_AUDIO_ENABLED: "false",
});
const ALLOWED = new Set([...APP_SETTINGS, ...Object.keys(DEFAULTS)]);
const MAX_BYTES = 1024 * 1024;

function locations(root) {
  const base = resolve(root);
  return {
    root: base,
    key: join(base, ".secrets", "development-env.key"),
    home: join(base, ".secrets", "gpg-home"),
    bundle: join(base, "secrets", "development.env.gpg"),
    local: join(base, ".env.local"),
  };
}

function readSettings(path) {
  if (!existsSync(path)) return {};
  const source = readFileSync(path, "utf8");
  if (Buffer.byteLength(source) > MAX_BYTES) throw new Error("Environment file is too large.");
  return parseEnv(source);
}

function browserSafeSupabaseKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload !== null && typeof payload === "object" && payload.role === "anon";
  } catch { return false; }
}

export function validateSharedSettings(settings) {
  for (const [name, value] of Object.entries(settings)) {
    if (!ALLOWED.has(name) || typeof value !== "string" || /[\r\n]/u.test(value) || value.includes("\u0000")) {
      throw new Error("Development bundle contains unsupported settings.");
    }
    if (name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" && value && !browserSafeSupabaseKey(value)) {
      throw new Error("Development bundle requires a browser-safe Supabase key.");
    }
  }
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (settings[name] !== value) throw new Error("Development bundle must keep paid features disabled.");
  }
  return settings;
}

function assignment(name, value) {
  const line = `${name}=${JSON.stringify(value)}`;
  if (parseEnv(line)[name] !== value) throw new Error("A setting cannot be represented safely in dotenv format.");
  return line;
}

export function collectSharedSettings(root) {
  const local = readSettings(join(root, ".env.local"));
  const credentials = readSettings(join(root, "credentials.env"));
  const settings = {};
  for (const name of APP_SETTINGS) {
    const value = local[name]?.trim() || credentials[name]?.trim();
    if (value) settings[name] = value;
  }
  Object.assign(settings, DEFAULTS);
  return validateSharedSettings(settings);
}

export function findGpg() {
  const candidates = [
    process.env.GPG_BINARY, "gpg",
    process.platform === "win32" && join(process.env.ProgramFiles || "C:/Program Files", "Git", "usr", "bin", "gpg.exe"),
    process.platform === "win32" && process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Git", "usr", "bin", "gpg.exe"),
  ].filter(Boolean);
  for (let candidate of candidates) {
    if (process.platform === "win32" && candidate === "gpg") {
      const located = spawnSync("where.exe", ["gpg"], { encoding: "utf8", windowsHide: true, shell: false });
      if (located.status === 0) candidate = located.stdout.trim().split(/\r?\n/u)[0];
    }
    const probe = spawnSync(candidate, ["--no-options", "--version"], {
      shell: false, windowsHide: true, stdio: "ignore", timeout: 10_000,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error("GPG is required. Install GnuPG or set GPG_BINARY to its executable; Git for Windows includes it.");
}

function ensureIgnoredKey(paths) {
  const result = spawnSync("git", ["-C", paths.root, "check-ignore", "--quiet", paths.key], {
    shell: false, windowsHide: true, stdio: "ignore", timeout: 10_000,
  });
  if (result.status !== 0) throw new Error("The .secrets key path must be ignored by Git before use.");
}

function verifyKey(paths) {
  ensureIgnoredKey(paths);
  if (!existsSync(paths.key)) {
    throw new Error("Missing .secrets/development-env.key. Obtain this unlock file privately from the project owner.");
  }
  if (!/^[A-Za-z0-9_-]{43,128}\r?\n?$/u.test(readFileSync(paths.key, "utf8"))) {
    throw new Error("The development unlock file is invalid; obtain the original file from the owner.");
  }
}

function runGpg(paths, gpg, operation, input) {
  verifyKey(paths);
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  // Git for Windows ships an MSYS GPG, which expects /c/... rather than C:\... .
  const msys = process.platform === "win32" && /\/usr\/bin\/gpg\.exe$/iu.test(gpg.replaceAll("\\", "/"));
  const gpgPath = (path) => msys
    ? path.replaceAll("\\", "/").replace(/^([A-Za-z]):/u, (_, drive) => `/${drive.toLowerCase()}`)
    : path;
  const args = [
    "--no-options", "--homedir", gpgPath(paths.home), "--batch", "--no-tty", "--pinentry-mode", "loopback",
    "--no-symkey-cache", "--passphrase-file", gpgPath(paths.key), "--output", "-",
    ...(operation === "encrypt"
      ? ["--symmetric", "--cipher-algo", "AES256", "--compress-algo", "none", "--s2k-mode", "3", "--s2k-count", "65011712"]
      : ["--decrypt"]),
  ];
  const result = spawnSync(gpg, args, {
    input, shell: false, windowsHide: true, maxBuffer: MAX_BYTES, timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0 || !result.stdout?.length) {
    throw new Error(operation === "encrypt"
      ? "GPG could not encrypt the development settings. No secret values were printed."
      : "GPG could not decrypt the bundle. Check the unlock file and bundle integrity.");
  }
  return result.stdout;
}

function atomicWrite(path, content, { replace = false, previous } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
  try {
    if (replace) {
      if (previous !== undefined && readFileSync(path, "utf8") !== previous) {
        throw new Error("The local environment changed during import; no settings were replaced.");
      }
      renameSync(temporary, path);
    } else {
      // A hard link atomically refuses an existing destination on Windows/Unix.
      linkSync(temporary, path);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function encryptDevelopmentEnvironment(root, { gpg = findGpg() } = {}) {
  const paths = locations(root);
  ensureIgnoredKey(paths);
  if (!existsSync(paths.key)) {
    if (existsSync(paths.bundle)) throw new Error("An encrypted bundle already exists. Recover its original unlock file before updating it.");
    atomicWrite(paths.key, randomBytes(32).toString("base64url") + "\n");
  }
  const settings = collectSharedSettings(paths.root);
  const plaintext = Object.entries(settings).map(([name, value]) => assignment(name, value)).join("\n") + "\n";
  const encrypted = runGpg(paths, gpg, "encrypt", Buffer.from(plaintext));
  atomicWrite(paths.bundle, encrypted, { replace: existsSync(paths.bundle) });
  return { names: Object.keys(settings), bundlePath: paths.bundle, keyPath: paths.key };
}

export function pullDevelopmentEnvironment(root, { merge = false, gpg = findGpg() } = {}) {
  const paths = locations(root);
  const existing = existsSync(paths.local);
  if (existing && !merge) throw new Error(".env.local already exists. Use --merge to fill only missing or blank settings.");
  if (!existsSync(paths.bundle)) throw new Error("The encrypted development bundle is missing; pull the current repository first.");
  const ciphertext = readFileSync(paths.bundle);
  if (ciphertext.length > MAX_BYTES) throw new Error("Development bundle is too large.");
  const decrypted = runGpg(paths, gpg, "decrypt", ciphertext);
  const settings = validateSharedSettings(parseEnv(decrypted.toString("utf8")));
  const previous = existing ? readFileSync(paths.local, "utf8") : undefined;
  const base = previous ?? (existsSync(join(paths.root, ".env.example"))
    ? readFileSync(join(paths.root, ".env.example"), "utf8") : "");
  const current = existing ? parseEnv(base) : {};
  const additions = Object.entries(settings).filter(([name]) => !current[name]?.trim());
  if (!additions.length && existing) return { names: [], localPath: paths.local };
  const content = `${base}${base.endsWith("\n") || !base ? "" : "\n"}\n# Imported shared development settings\n${additions.map(([name, value]) => assignment(name, value)).join("\n")}\n`;
  const verified = parseEnv(content);
  for (const [name, value] of Object.entries(current)) {
    if (value.trim() && verified[name] !== value) throw new Error("Import would change an existing setting; no file was written.");
  }
  for (const [name, value] of additions) {
    if (verified[name] !== value) throw new Error("Imported settings could not be represented safely.");
  }
  atomicWrite(paths.local, content, { replace: existing, previous });
  return { names: additions.map(([name]) => name), localPath: paths.local };
}

function main() {
  const [operation, ...options] = process.argv.slice(2);
  if (!new Set(["encrypt", "pull"]).has(operation) || options.some((value) => value !== "--merge") || (operation === "encrypt" && options.length)) {
    throw new Error("Usage: node scripts/development-env.mjs encrypt | pull [--merge]");
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = operation === "encrypt"
    ? encryptDevelopmentEnvironment(root)
    : pullDevelopmentEnvironment(root, { merge: options.includes("--merge") });
  console.log(operation === "encrypt" ? "Encrypted application-only development bundle updated." : "Local environment import complete.");
  console.log(`Settings ${operation === "encrypt" ? "included" : "filled"}: ${result.names.join(", ") || "none; existing settings preserved"}`);
  if (operation === "encrypt") console.log("Share .secrets/development-env.key privately with trusted collaborators; never commit or upload it.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : "Development environment operation failed.");
    process.exitCode = 1;
  }
}
