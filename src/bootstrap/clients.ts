import { BraveSearchClient } from '../brave/client.js';
import SerperClient from '../serper/client.js';

export interface BootstrapOptions {
  env?: NodeJS.ProcessEnv;
}

function redacted(value?: string) {
  return value ? '[REDACTED]' : '[MISSING]';
}

export function createBraveClient(opts: BootstrapOptions = {}) {
  const env = opts.env ?? process.env;
  const apiKey = env.BRAVE_SEARCH_API_KEY ?? '';
  const endpoint = env.BRAVE_SEARCH_API_URL;
  const timeoutMs = env.BRAVE_SEARCH_TIMEOUT_MS ? Number(env.BRAVE_SEARCH_TIMEOUT_MS) : undefined;
  const maxRetries = env.BRAVE_SEARCH_MAX_RETRIES ? Number(env.BRAVE_SEARCH_MAX_RETRIES) : undefined;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('BRAVE_SEARCH_API_KEY is required to create BraveSearchClient');
  }

  return new BraveSearchClient({ apiKey, endpoint, timeoutMs, maxRetries });
}

export function createSerperClient(opts: BootstrapOptions = {}) {
  const env = opts.env ?? process.env;
  const apiKey = env.SERPER_API_KEY ?? '';
  const endpoint = env.SERPER_API_URL;
  const timeoutMs = env.SERPER_TIMEOUT_MS ? Number(env.SERPER_TIMEOUT_MS) : undefined;
  const maxRetries = env.SERPER_MAX_RETRIES ? Number(env.SERPER_MAX_RETRIES) : undefined;
  const gl = env.SERPER_GL;
  const hl = env.SERPER_HL;
  const location = env.SERPER_LOCATION;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('SERPER_API_KEY is required to create SerperClient');
  }

  return new SerperClient({ apiKey, endpoint, timeoutMs, maxRetries, gl, hl, location });
}

export function createSerperService(opts: BootstrapOptions = {}) {
  const serper = createSerperClient(opts);
  // Brave client is optional — only create if key exists
  const env = opts.env ?? process.env;
  let brave;
  if (env.BRAVE_SEARCH_API_KEY) {
    brave = createBraveClient(opts);
  }
  // SerperService expects options compatible with SerperClient; we return constructed objects for the app to wire
  return { serperClient: serper, braveClient: brave };
}

// Convenience: create a SerperService instance wired from env (uses SerperService class)
import { SerperService } from '../serper/service.js';

export function createSerperServiceInstance(opts: BootstrapOptions = {}) {
  const env = opts.env ?? process.env;
  const apiKey = env.SERPER_API_KEY ?? '';
  const endpoint = env.SERPER_API_URL;
  const timeoutMs = env.SERPER_TIMEOUT_MS ? Number(env.SERPER_TIMEOUT_MS) : undefined;
  const maxRetries = env.SERPER_MAX_RETRIES ? Number(env.SERPER_MAX_RETRIES) : undefined;
  const gl = env.SERPER_GL;
  const hl = env.SERPER_HL;
  const location = env.SERPER_LOCATION;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('SERPER_API_KEY is required to create SerperService');
  }

  const braveClient = env.BRAVE_SEARCH_API_KEY ? createBraveClient(opts) : undefined;

  return new SerperService({ apiKey, endpoint, timeoutMs, maxRetries, gl, hl, location, braveClient });
}

export default { createBraveClient, createSerperClient, createSerperService };
