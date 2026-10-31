import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, test } from "node:test";
import ts from "typescript";
import { getPublicEnvironment } from "../src/lib/env/public.ts";
import { getServerEnvironment } from "../src/lib/env/server.ts";
import { getVoiceInputConfiguration } from "../src/lib/voice/server.ts";

const settingNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_LOG",
  "VOICE_INPUT_ENABLED",
  "VAPI_PRIVATE_KEY",
  "VAPI_ASSISTANT_ID",
];
let originalSettings;

beforeEach(() => {
  originalSettings = new Map(settingNames.map((name) => [name, process.env[name]]));
  for (const name of settingNames) delete process.env[name];
});

afterEach(() => {
  for (const [name, value] of originalSettings) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setPublicSettings() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test-only";
}

// Node does not resolve the app's @/ alias. Compile this module in memory and
// point its imports at the actual installed SDK and application environment.
// Server-only still resolves through Node's react-server condition in this check.
const factoryUrl = new URL("../src/lib/anthropic/server.ts", import.meta.url);
const factorySource = ts.transpileModule(await readFile(factoryUrl, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('"@anthropic-ai/sdk"', JSON.stringify(import.meta.resolve("@anthropic-ai/sdk")))
  .replace('"server-only"', JSON.stringify(import.meta.resolve("server-only")))
  .replace('"@/lib/env/server"',
    JSON.stringify(new URL("../src/lib/env/server.ts", import.meta.url).href));
const { createConversationModelClient } = await import(
  `data:text/javascript;base64,${Buffer.from(factorySource).toString("base64")}`
);

// Execute the real Next.js configuration with an absolute schema import. Each
// distinct URL reevaluates its preflight against the settings for that test.
const configSource = ts.transpileModule(
  await readFile(new URL("../next.config.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  },
).outputText.replace('"./src/lib/env/public"',
  JSON.stringify(new URL("../src/lib/env/public.ts", import.meta.url).href));
let configLoad = 0;
function loadAppConfiguration() {
  return import(`data:text/javascript;base64,${Buffer.from(configSource).toString("base64")}#${configLoad++}`);
}

test("public configuration accepts publishable keys and local HTTP development", () => {
  setPublicSettings();
  assert.equal(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "sb_publishable_test-only");
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  assert.equal(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
});

test("configuration trims accidental surrounding whitespace", () => {
  setPublicSettings();
  process.env.NEXT_PUBLIC_SUPABASE_URL = " https://example.supabase.co ";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = " sb_publishable_test-only ";
  process.env.ANTHROPIC_API_KEY = " test-only-api-key ";
  process.env.ANTHROPIC_MODEL = " test-only-model ";
  assert.equal(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL, "https://example.supabase.co");
  assert.equal(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "sb_publishable_test-only");
  assert.deepEqual(getServerEnvironment(), {
    ANTHROPIC_API_KEY: "test-only-api-key",
    ANTHROPIC_MODEL: "test-only-model",
  });
});

test("public configuration rejects unsupported endpoint schemes and missing URLs", () => {
  setPublicSettings();
  for (const value of ["", " ", "not-a-url", "ftp://example.com", "javascript:alert(1)"]) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = value;
    assert.throws(getPublicEnvironment, /NEXT_PUBLIC_SUPABASE_URL/);
  }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.throws(getPublicEnvironment, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("public configuration accepts legacy anon JWT keys", () => {
  setPublicSettings();
  const anonKey = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
  assert.equal(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, anonKey);
});

test("public configuration refuses privileged keys and malformed keys", () => {
  setPublicSettings();
  const legacyServiceKey = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test";
  for (const value of ["", " ", "sb_secret_test-only", legacyServiceKey,
    "sb_publishable_", "sb_publishable_contains whitespace", "arbitrary-key",
    "header.not-json.signature", "header.bnVsbA.signature",
    "header.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature"]) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = value;
    assert.throws(getPublicEnvironment, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  }
});

test("Next configuration permits a credential-free starter or valid public settings", async () => {
  assert.equal((await loadAppConfiguration()).default.poweredByHeader, false);
  setPublicSettings();
  assert.equal((await loadAppConfiguration()).default.poweredByHeader, false);
});

test("Next configuration rejects partial or privileged settings before bundling", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(loadAppConfiguration(), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_DO_NOT_INCLUDE_THIS";
  await assert.rejects(loadAppConfiguration(), (error) => {
    assert.equal(error.message,
      "Missing or invalid application settings: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    return true;
  });
});

test("server configuration rejects missing, blank, or whitespace-containing values", () => {
  assert.throws(getServerEnvironment, /ANTHROPIC_API_KEY.*ANTHROPIC_MODEL/);
  process.env.ANTHROPIC_API_KEY = "test-only-api-key";
  process.env.ANTHROPIC_MODEL = "test-only-model";
  for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) {
    const valid = process.env[name];
    for (const value of ["", " \t ", "embedded whitespace", "embedded\nnewline"]) {
      process.env[name] = value;
      assert.throws(getServerEnvironment, new RegExp(name));
    }
    process.env[name] = valid;
  }
});

test("configuration errors expose field names without input values", () => {
  setPublicSettings();
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_DO_NOT_INCLUDE_THIS";
  assert.throws(getPublicEnvironment, (error) => {
    assert.equal(error.message,
      "Missing or invalid application settings: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    return true;
  });
  process.env.ANTHROPIC_API_KEY = "DO_NOT_INCLUDE THIS_VALUE";
  process.env.ANTHROPIC_MODEL = "test-only-model";
  assert.throws(getServerEnvironment, (error) => {
    assert.equal(error.message, "Missing or invalid server settings: ANTHROPIC_API_KEY");
    return true;
  });
});

test("Anthropic factory keeps endpoint, logging, retries, and timeout bounded", () => {
  process.env.ANTHROPIC_API_KEY = "test-only-api-key";
  process.env.ANTHROPIC_MODEL = "test-only-model";
  process.env.ANTHROPIC_BASE_URL = "https://unintended-endpoint.example";
  process.env.ANTHROPIC_LOG = "debug";
  const { client, model } = createConversationModelClient();
  assert.equal(client.baseURL, "https://api.anthropic.com");
  assert.equal(client.logLevel, "off");
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 45_000);
  assert.equal(model, "test-only-model");
});

test("optional voice configuration is disabled without Vapi credentials", () => {
  assert.deepEqual(getVoiceInputConfiguration(), {
    enabled: false, provider: "vapi", mode: "dictation",
  });
  process.env.VOICE_INPUT_ENABLED = "false";
  process.env.VAPI_PRIVATE_KEY = "unused-invalid key";
  assert.equal(getVoiceInputConfiguration().enabled, false);
});

test("enabled voice configuration requires explicit server-only Vapi settings", () => {
  process.env.VOICE_INPUT_ENABLED = "true";
  assert.throws(getVoiceInputConfiguration, /VAPI_PRIVATE_KEY.*VAPI_ASSISTANT_ID/);
  process.env.VAPI_PRIVATE_KEY = " test-only-private-key ";
  process.env.VAPI_ASSISTANT_ID = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(getVoiceInputConfiguration(), {
    enabled: true, provider: "vapi", mode: "dictation",
    privateKey: "test-only-private-key",
    assistantId: "11111111-1111-4111-8111-111111111111",
  });
});

test("voice configuration rejects invalid flags and reports no secret values", () => {
  process.env.VOICE_INPUT_ENABLED = "yes";
  assert.throws(getVoiceInputConfiguration, /voice settings: VOICE_INPUT_ENABLED$/);
  process.env.VOICE_INPUT_ENABLED = "true";
  process.env.VAPI_PRIVATE_KEY = "DO_NOT_INCLUDE THIS_VALUE";
  process.env.VAPI_ASSISTANT_ID = "not-a-uuid";
  assert.throws(getVoiceInputConfiguration, (error) => {
    assert.equal(error.message,
      "Missing or invalid voice settings: VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID");
    return true;
  });
});
