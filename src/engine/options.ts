// Persisted player options (accessibility / comfort toggles), stored in
// localStorage. Import-safe in non-browser contexts (guarded).

const STORAGE_KEY = 'tabaco-options';

interface Options {
  /** "J'aime pas les maths": show the change-due hint at the register. */
  mathHelp: boolean;
}

let opts: Options = { mathHelp: false };
let loaded = false;

function load(): void {
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Options>;
    if (typeof parsed.mathHelp === 'boolean') opts.mathHelp = parsed.mathHelp;
  } catch {
    // ignore unavailable/corrupt storage
  }
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // ignore
  }
}

/** Whether the change-due hint is shown at the register. */
export function mathHelpEnabled(): boolean {
  if (!loaded) load();
  return opts.mathHelp;
}

export function setMathHelp(value: boolean): void {
  if (!loaded) load();
  opts.mathHelp = value;
  persist();
}

export function toggleMathHelp(): void {
  setMathHelp(!mathHelpEnabled());
}
