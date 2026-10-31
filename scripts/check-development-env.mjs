import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import {
  APP_SETTINGS, collectSharedSettings, encryptDevelopmentEnvironment, findGpg,
  pullDevelopmentEnvironment, validateSharedSettings,
} from "./development-env.mjs";

const gpg = findGpg();
const roots = [];
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "dartmouth-env-test-"));
  roots.push(root);
  const git = spawnSync("git", ["init", "--quiet", root], { shell: false, windowsHide: true });
  assert.equal(git.status, 0);
  writeFileSync(join(root, ".gitignore"), ".secrets/\n.env.local\ncredentials.env\n");
  writeFileSync(join(root, ".env.example"), "DEEPGRAM_API_KEY=\nTAVUS_API_KEY=\nVOICE_INPUT_ENABLED=false\nTAVUS_AUDIO_ENABLED=false\nLLM_ADAPTER=mock\nCONTACT_ENCRYPTION_KEY=\n");
  return root;
}
function fixture(root) {
  writeFileSync(join(root, "credentials.env"), "ANTHROPIC_API_KEY=dummy-anthropic\nGITHUB_TOKEN=dummy-admin\nVERCEL_TOKEN=dummy-admin\nSUPABASE_ACCESS_TOKEN=dummy-admin\nCONTACT_ENCRYPTION_KEY=dummy-contact-key\n");
  writeFileSync(join(root, ".env.local"), "DEEPGRAM_API_KEY=dummy-deepgram\nTAVUS_API_KEY=dummy-tavus\nTAVUS_PAL_ID=pipecat0\nVOICE_INPUT_ENABLED=true\nTAVUS_AUDIO_ENABLED=true\nLLM_ADAPTER=anthropic\n");
}

after(() => {
  const parent = resolve(tmpdir()) + sep;
  for (const root of roots) {
    const checked = resolve(root);
    assert.ok(checked.startsWith(parent) && checked.slice(parent.length).startsWith("dartmouth-env-test-"));
    rmSync(checked, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("only allowlisted application settings are selected and shared features default off", () => {
  const root = workspace();
  fixture(root);
  const settings = collectSharedSettings(root);
  assert.equal(settings.ANTHROPIC_API_KEY, "dummy-anthropic");
  assert.equal(settings.DEEPGRAM_API_KEY, "dummy-deepgram");
  assert.equal(settings.VOICE_INPUT_ENABLED, "false");
  assert.equal(settings.TAVUS_AUDIO_ENABLED, "false");
  assert.equal(settings.LLM_ADAPTER, "mock");
  for (const key of ["GITHUB_TOKEN", "VERCEL_TOKEN", "SUPABASE_ACCESS_TOKEN", "CONTACT_ENCRYPTION_KEY"]) {
    assert.equal(Object.hasOwn(settings, key), false);
  }
  writeFileSync(join(root, ".env.local"), "ANTHROPIC_API_KEY=personal-app-key\n");
  assert.equal(collectSharedSettings(root).ANTHROPIC_API_KEY, "personal-app-key");
});

test("unsupported or privileged public Supabase settings cannot be shared or imported", () => {
  const defaults = { LLM_ADAPTER: "mock", VOICE_INPUT_ENABLED: "false", TAVUS_AUDIO_ENABLED: "false" };
  for (const extra of [{ GITHUB_TOKEN: "dummy" }, { CONTACT_ENCRYPTION_KEY: "dummy" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_dummy" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "header.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature" },
    { DEEPGRAM_API_KEY: "bad\nvalue" }, { VOICE_INPUT_ENABLED: "true" }]) {
    assert.throws(() => validateSharedSettings({ ...defaults, ...extra }));
  }
  assert.throws(() => validateSharedSettings({}));
  assert.doesNotThrow(() => validateSharedSettings({ ...defaults, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dummy" }));
});

test("GPG encryption roundtrip is opaque and import refuses to overwrite an existing env", () => {
  const owner = workspace();
  fixture(owner);
  const punctuationKey = "dummy:token/with+punctuation=.#'";
  writeFileSync(join(owner, ".env.local"), readFileSync(join(owner, ".env.local"), "utf8") + `TAVUS_API_KEY="${punctuationKey}"\n`);
  const encrypted = encryptDevelopmentEnvironment(owner, { gpg });
  const bytes = readFileSync(encrypted.bundlePath);
  assert.equal(bytes.includes(Buffer.from("dummy-deepgram")), false);
  const existing = readFileSync(join(owner, ".env.local"), "utf8");
  assert.throws(() => pullDevelopmentEnvironment(owner, { gpg }), /already exists/);
  assert.equal(readFileSync(join(owner, ".env.local"), "utf8"), existing);

  const recipient = workspace();
  mkdirSync(join(recipient, ".secrets"));
  mkdirSync(join(recipient, "secrets"));
  copyFileSync(encrypted.keyPath, join(recipient, ".secrets", "development-env.key"));
  copyFileSync(encrypted.bundlePath, join(recipient, "secrets", "development.env.gpg"));
  pullDevelopmentEnvironment(recipient, { gpg });
  const imported = parseEnv(readFileSync(join(recipient, ".env.local"), "utf8"));
  assert.equal(imported.DEEPGRAM_API_KEY, "dummy-deepgram");
  assert.equal(imported.ANTHROPIC_API_KEY, "dummy-anthropic");
  assert.equal(imported.TAVUS_API_KEY, punctuationKey);
  assert.equal(imported.VOICE_INPUT_ENABLED, "false");
  assert.equal(imported.CONTACT_ENCRYPTION_KEY, "");
  assert.equal(Object.hasOwn(imported, "GITHUB_TOKEN"), false);

  // Exercise the application's actual dotenv loader, isolated from this process
  // and any ambient provider settings. It reads only the dummy checkout.
  const env = { ...process.env };
  for (const name of [...APP_SETTINGS, "LLM_ADAPTER", "VOICE_INPUT_ENABLED", "TAVUS_AUDIO_ENABLED"]) delete env[name];
  const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import nextEnv from '@next/env';
    const result = nextEnv.loadEnvConfig(process.argv[1], true, { error() {} }, true);
    process.stdout.write(JSON.stringify(result.parsedEnv));
  `, recipient], { env, encoding: "utf8", shell: false, windowsHide: true, timeout: 10_000 });
  assert.equal(loaded.status, 0);
  assert.deepEqual(JSON.parse(loaded.stdout), imported);
});

test("merge fills blanks while preserving existing personal keys and formatting", () => {
  const root = workspace();
  fixture(root);
  encryptDevelopmentEnvironment(root, { gpg });
  const original = "# Keep my settings\nDEEPGRAM_API_KEY=personal-key\nTAVUS_API_KEY=\nVOICE_INPUT_ENABLED=true\nOTHER_LOCAL_VALUE=preserved\n";
  writeFileSync(join(root, ".env.local"), original);
  const result = pullDevelopmentEnvironment(root, { gpg, merge: true });
  const content = readFileSync(join(root, ".env.local"), "utf8");
  const imported = parseEnv(content);
  assert.ok(content.startsWith(original));
  assert.equal(imported.DEEPGRAM_API_KEY, "personal-key");
  assert.equal(imported.VOICE_INPUT_ENABLED, "true");
  assert.equal(imported.TAVUS_API_KEY, "dummy-tavus");
  assert.equal(imported.OTHER_LOCAL_VALUE, "preserved");
  assert.equal(result.names.includes("DEEPGRAM_API_KEY"), false);
});

test("wrong unlock files and corrupted ciphertext leave the local environment intact", () => {
  const root = workspace();
  fixture(root);
  const encrypted = encryptDevelopmentEnvironment(root, { gpg });
  const correctKey = readFileSync(encrypted.keyPath);
  const ciphertext = readFileSync(encrypted.bundlePath);
  const original = readFileSync(join(root, ".env.local"), "utf8");
  writeFileSync(encrypted.keyPath, "a".repeat(43) + "\n");
  assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /could not decrypt/);
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
  writeFileSync(encrypted.keyPath, correctKey);
  const tampered = Buffer.from(ciphertext);
  tampered[Math.floor(tampered.length / 2)] ^= 1;
  writeFileSync(encrypted.bundlePath, tampered);
  assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /could not decrypt/);
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
  writeFileSync(encrypted.bundlePath, Buffer.from("not-an-openpgp-message"));
  assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /could not decrypt/);
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
});

test("missing original unlock file and unignored key paths fail closed", () => {
  const root = workspace();
  mkdirSync(join(root, "secrets"));
  writeFileSync(join(root, "secrets", "development.env.gpg"), "existing");
  assert.throws(() => encryptDevelopmentEnvironment(root, { gpg }), /Recover its original unlock/);
  assert.equal(existsSync(join(root, ".secrets", "development-env.key")), false);
  writeFileSync(join(root, ".gitignore"), ".env.local\n");
  assert.throws(() => encryptDevelopmentEnvironment(root, { gpg }), /must be ignored/);
});

test("an unencrypted OpenPGP literal packet cannot masquerade as the encrypted bundle", () => {
  const root = workspace();
  fixture(root);
  mkdirSync(join(root, ".secrets"));
  mkdirSync(join(root, "secrets"));
  writeFileSync(join(root, ".secrets", "development-env.key"), "a".repeat(43) + "\n");
  const original = readFileSync(join(root, ".env.local"), "utf8");
  const encrypted = encryptDevelopmentEnvironment(root, { gpg });
  const authentic = readFileSync(encrypted.bundlePath);
  const plaintext = Buffer.from("LLM_ADAPTER=mock\nVOICE_INPUT_ENABLED=false\nTAVUS_AUDIO_ENABLED=false\nDEEPGRAM_API_KEY=dummy-injection\n");
  // OpenPGP tag 11: binary format, no filename, zero timestamp, literal text.
  const body = Buffer.concat([Buffer.from([0x62, 0, 0, 0, 0, 0]), plaintext]);
  assert.ok(body.length < 192);
  const forged = Buffer.concat([Buffer.from([0xcb, body.length]), body]);
  for (const packet of [forged, Buffer.concat([authentic, forged]), Buffer.concat([forged, authentic])]) {
    writeFileSync(encrypted.bundlePath, packet);
    assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /could not decrypt/);
    assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
  }
});

test("import refuses tracked or unignored plaintext destinations before writing", () => {
  const root = workspace();
  fixture(root);
  encryptDevelopmentEnvironment(root, { gpg });
  const original = readFileSync(join(root, ".env.local"), "utf8");
  writeFileSync(join(root, ".gitignore"), ".secrets/\ncredentials.env\n");
  assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /\.env\.local path must be ignored/);
  writeFileSync(join(root, ".gitignore"), ".secrets/\n.env.local\ncredentials.env\n");
  const staged = spawnSync("git", ["-C", root, "add", "--force", ".env.local"], { shell: false, windowsHide: true, stdio: "ignore" });
  assert.equal(staged.status, 0);
  assert.throws(() => pullDevelopmentEnvironment(root, { gpg, merge: true }), /\.env\.local path must be ignored/);
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
});

test("unsupported dotenv values fail closed without replacing the encrypted bundle", () => {
  const root = workspace();
  fixture(root);
  const encrypted = encryptDevelopmentEnvironment(root, { gpg });
  const original = readFileSync(encrypted.bundlePath);
  for (const value of ["dummy$other", "dummy${OTHER}", "dummy\\path", 'dummy"quote']) {
    writeFileSync(join(root, ".env.local"), `TAVUS_API_KEY='${value}'\n`);
    assert.throws(() => encryptDevelopmentEnvironment(root, { gpg }), /represented safely in dotenv/);
    assert.deepEqual(readFileSync(encrypted.bundlePath), original);
  }
});
