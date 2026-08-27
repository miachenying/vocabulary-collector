export const DICTIONARY_TIMEOUT_MS = 3500;

export function dictionaryRequestInit(): RequestInit {
  return { signal: AbortSignal.timeout(DICTIONARY_TIMEOUT_MS) };
}
