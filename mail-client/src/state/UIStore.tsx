import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { seedDraft, type ComposeMode } from '../lib/compose';
import { loadJSON, saveJSON } from '../lib/storage';
import type { DraftInput, Email } from '../types/mail';
import { useMailState } from './MailStore';
import type { FolderView, QuickFilter, Scope } from './selectors';

export type Screen = 'mail' | 'accounts' | 'settings';

export interface Prefs {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  previewLines: 1 | 2;
  conversations: boolean;
  markReadOnOpen: boolean;
  remoteImages: boolean;
  /** Reserved for the later AI features. Off by default. */
  smartFeatures: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  density: 'comfortable',
  previewLines: 2,
  conversations: true,
  markReadOnOpen: true,
  remoteImages: false,
  smartFeatures: false,
};

export interface ComposeWindow {
  key: string;
  mode: ComposeMode;
  draft: DraftInput;
  minimized: boolean;
  maximized: boolean;
}

const MAX_COMPOSERS = 3;
let composeSeq = 1;

function useUIController() {
  const { accounts } = useMailState();
  const [screen, setScreenState] = useState<Screen>('mail');
  const [folder, setFolder] = useState<FolderView>('inbox');
  const [scope, setScopeState] = useState<Scope>('all');
  const [query, setQueryState] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawer] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...(loadJSON<Partial<Prefs>>('prefs') ?? {}) }));
  const [composers, setComposers] = useState<ComposeWindow[]>([]);

  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0b1428' : '#0f1d3a');
  }, [resolvedTheme]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      saveJSON('prefs', next);
      return next;
    });
  }, []);

  const resetView = () => {
    setSelectedKey(null);
    setChecked(new Set());
    setFilter('all');
  };

  const go = useCallback((f: FolderView, s?: Scope) => {
    setScreenState('mail');
    setFolder(f);
    if (s !== undefined) setScopeState(s);
    setQueryState('');
    resetView();
    setDrawer(false);
  }, []);

  const setScope = useCallback((s: Scope) => {
    setScopeState(s);
    resetView();
  }, []);

  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    setDrawer(false);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setChecked(new Set());
    setScreenState('mail');
  }, []);

  const select = useCallback((key: string | null) => setSelectedKey(key), []);

  const openCompose = useCallback(
    (mode: ComposeMode, source?: Email) => {
      setComposers((list) => {
        if (mode === 'draft' && source) {
          const open = list.find((c) => c.draft.id === source.id);
          if (open) return list.map((c) => (c === open ? { ...c, minimized: false } : { ...c, minimized: true }));
        }
        const win: ComposeWindow = { key: `compose-${composeSeq++}`, mode, draft: seedDraft(mode, source, accounts), minimized: false, maximized: false };
        // Keep a few windows; older ones minimise so the newest has room.
        return [...list.map((c) => ({ ...c, minimized: true })), win].slice(-MAX_COMPOSERS);
      });
    },
    [accounts],
  );

  const closeComposer = useCallback((key: string) => setComposers((list) => list.filter((c) => c.key !== key)), []);
  const updateComposer = useCallback(
    (key: string, patch: Partial<Pick<ComposeWindow, 'minimized' | 'maximized'>>) => setComposers((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c))),
    [],
  );

  return useMemo(
    () => ({
      screen,
      setScreen,
      folder,
      scope,
      setScope,
      go,
      query,
      setQuery,
      filter,
      setFilter,
      selectedKey,
      select,
      checked,
      setChecked,
      drawerOpen,
      setDrawer,
      prefs,
      setPrefs,
      resolvedTheme,
      composers,
      openCompose,
      closeComposer,
      updateComposer,
    }),
    [screen, setScreen, folder, scope, setScope, go, query, setQuery, filter, selectedKey, select, checked, drawerOpen, prefs, setPrefs, resolvedTheme, composers, openCompose, closeComposer, updateComposer],
  );
}

export type UI = ReturnType<typeof useUIController>;

const UICtx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const ui = useUIController();
  return <UICtx.Provider value={ui}>{children}</UICtx.Provider>;
}

export function useUI(): UI {
  const v = useContext(UICtx);
  if (!v) throw new Error('useUI must be used inside <UIProvider>');
  return v;
}
