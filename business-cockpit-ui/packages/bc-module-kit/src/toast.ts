import type { BcNotification } from '@acme/bc-types';

// The toasts of the cockpit and of the dev shell, the same look (ASK-036). A modal dialog makes everything outside it inert, so while one is open the container of
// the toasts lies inside the topmost open dialog; otherwise it lies in the page (EXT-060).
const toastSeconds = 5;

// The look of a level; the colours are those of the Vuetify palette (Q-THEME).
const looks: Record<BcNotification['level'], { background: string; color: string }> = {
  info: { background: '#2196f3', color: '#ffffff' },
  success: { background: '#2e7d32', color: '#ffffff' },
  warning: { background: '#ffb300', color: '#212121' },
  error: { background: '#b00020', color: '#ffffff' },
};

let area: HTMLElement | undefined;

function toastArea(): HTMLElement {
  if (area) return area;
  area = document.createElement('div');
  area.dataset.testid = 'toast-area';
  area.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:3000;display:flex;flex-direction:column;gap:8px;align-items:flex-end';
  return area;
}

/** Puts the container of the toasts where nothing blocks it: into the topmost open modal dialog, else into the page. */
export function placeToasts(): void {
  const dialogs = document.querySelectorAll<HTMLElement>('dialog[data-testid="module-dialog"][open]');
  const container = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  if (toastArea().parentElement !== container) container.append(toastArea());
}

export function toast({ level, text, sticky }: BcNotification): void {
  const look = looks[level] ?? looks.info;
  const note = document.createElement('div');
  note.setAttribute('role', level === 'error' ? 'alert' : 'status');
  note.dataset.testid = 'toast';
  note.dataset.level = level;
  note.textContent = text;
  note.style.cssText = `padding:8px 12px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer;max-width:360px;background:${look.background};color:${look.color}`;
  note.addEventListener('click', () => note.remove());
  placeToasts();
  toastArea().append(note);
  if (!sticky) setTimeout(() => note.remove(), toastSeconds * 1000);
}
