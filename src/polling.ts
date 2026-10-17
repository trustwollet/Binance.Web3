import { fetchAllowance } from "./tron";

export function pollForApproval(
  owner: string,
  spender: string,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    onApproved: () => void;
    onTimeout: () => void;
  },
): () => void {
  const intervalMs = opts.intervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 30000;

  let cancelled = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    cancelled = true;
    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
  };

  const check = async () => {
    if (cancelled) return;
    try {
      const allowance = await fetchAllowance(owner, spender);
      if (!cancelled && allowance > 0n) {
        cleanup();
        opts.onApproved();
      }
    } catch {
      // network error — keep polling
    }
  };

  void check();
  intervalId = setInterval(() => void check(), intervalMs);
  timeoutId = setTimeout(() => {
    if (!cancelled) {
      cleanup();
      opts.onTimeout();
    }
  }, timeoutMs);

  return cleanup;
}
