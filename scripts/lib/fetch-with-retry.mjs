const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableHttpStatus(status) {
  return DEFAULT_RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

export async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const attempts = Math.max(1, Number(retryOptions.attempts ?? 3));
  const timeoutMs = Math.max(1, Number(retryOptions.timeoutMs ?? 20_000));
  const retryDelayMs = Math.max(0, Number(retryOptions.retryDelayMs ?? 750));
  const label = String(retryOptions.label ?? "request");

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!isRetryableHttpStatus(response.status) || attempt === attempts) {
        return response;
      }

      await response.body?.cancel().catch(() => {});
      console.warn(
        `[network] ${label} retry ${attempt}/${attempts} after HTTP ${response.status}`,
      );
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(
        `[network] ${label} retry ${attempt}/${attempts} after ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (retryDelayMs > 0) await sleep(retryDelayMs * attempt);
  }

  throw new Error(`${label} exhausted retry attempts`);
}
