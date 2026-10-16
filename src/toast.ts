type ToastType = "success" | "error" | "warning" | "info";

export function showToast(
  message: string,
  type: ToastType = "info",
  durationMs = 4000,
): void {
  let container = document.querySelector<HTMLElement>(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message"></span>
  `;
  toast.querySelector(".toast-message")!.textContent = message;

  container.appendChild(toast);

  const dismiss = (): void => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  };

  toast.addEventListener("click", dismiss);
  setTimeout(dismiss, durationMs);
}
