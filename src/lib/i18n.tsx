import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

// Browser-side translation via Google's public unauthenticated endpoint.
// Works on ANY hosting environment (Vercel, Lovable, self-hosted) with no
// API key or server function — the endpoint accepts CORS browser calls.
async function googleTranslate(
  texts: string[],
  target: "hi" | "mr",
): Promise<string[]> {
  // Endpoint has a length cap per request; send each string individually but
  // in parallel batches of 10 so latency stays low.
  // Fully parallel — fire all requests at once for fastest UI conversion.
  const results = await Promise.all(
    texts.map(async (text) => {
      try {
        const url =
          "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
          target +
          "&dt=t&q=" +
          encodeURIComponent(text);
        const res = await fetch(url);
        if (!res.ok) return text;
        const json = (await res.json()) as unknown;
        if (Array.isArray(json) && Array.isArray(json[0])) {
          return (json[0] as Array<unknown>)
            .map((row) =>
              Array.isArray(row) && typeof row[0] === "string" ? row[0] : "",
            )
            .join("");
        }
        return text;
      } catch {
        return text;
      }
    }),
  );
  return results;
}

export type LangCode = "en" | "hi" | "mr";

export const LANG_LABELS: Record<LangCode, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

export const NAME_TO_CODE: Record<string, LangCode> = {
  english: "en",
  hindi: "hi",
  marathi: "mr",
};

const STORAGE_KEY = "rg.lang";
const CACHE_PREFIX = "rg.tr.";

// Static seed dictionary so common chrome translates instantly without an API call.
const SEED: Record<Exclude<LangCode, "en">, Record<string, string>> = {
  hi: {
    Dashboard: "डैशबोर्ड",
    Organizations: "संगठन",
    Contracts: "अनुबंध",
    Employees: "कर्मचारी",
    Attendance: "उपस्थिति",
    Payroll: "वेतन",
    Invoice: "चालान",
    Inventory: "इन्वेंट्री",
    Vehicles: "वाहन",
    Assets: "संपत्तियाँ",
    "Control Center": "नियंत्रण केंद्र",
    "My Profile": "मेरी प्रोफ़ाइल",
    "My Inventory": "मेरी इन्वेंट्री",
    Logout: "लॉग आउट",
    "Sign out": "साइन आउट",
    Search: "खोजें",
    Save: "सहेजें",
    Cancel: "रद्द करें",
    "Add New": "नया जोड़ें",
    Edit: "संपादित करें",
    Delete: "हटाएँ",
    Export: "निर्यात",
    Status: "स्थिति",
    Name: "नाम",
    Actions: "क्रियाएँ",
    Language: "भाषा",
    Settings: "सेटिंग्स",
    Notifications: "सूचनाएँ",
    Profile: "प्रोफ़ाइल",
  },
  mr: {
    Dashboard: "डॅशबोर्ड",
    Organizations: "संस्था",
    Contracts: "करार",
    Employees: "कर्मचारी",
    Attendance: "उपस्थिती",
    Payroll: "पगारपत्रक",
    Invoice: "चलन",
    Inventory: "साठा",
    Vehicles: "वाहने",
    Assets: "मालमत्ता",
    "Control Center": "नियंत्रण केंद्र",
    "My Profile": "माझे प्रोफाइल",
    "My Inventory": "माझा साठा",
    Logout: "बाहेर पडा",
    "Sign out": "बाहेर पडा",
    Search: "शोधा",
    Save: "जतन करा",
    Cancel: "रद्द करा",
    "Add New": "नवीन जोडा",
    Edit: "संपादित करा",
    Delete: "हटवा",
    Export: "निर्यात",
    Status: "स्थिती",
    Name: "नाव",
    Actions: "क्रिया",
    Language: "भाषा",
    Settings: "सेटिंग्ज",
    Notifications: "सूचना",
    Profile: "प्रोफाइल",
  },
};

type Ctx = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (s: string) => string;
  enabled: LangCode[];
};

const I18nCtx = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (s) => s,
  enabled: ["en", "hi", "mr"],
});

// ============================================================================
// DOM auto-translator
// ----------------------------------------------------------------------------
// Walks every visible text node and translates it to the target language using
// the Lovable AI Gateway, with persistent localStorage cache so each unique
// string is paid for at most once. Originals are stashed on the node so we can
// restore English without a reload.
// ============================================================================

const ORIG_KEY = "__rgOrig";
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "SVG",
  "PATH",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
]);

// Strings that look like data, not UI labels.
const DATA_RE =
  /^[\s\d\W_]*$|^[A-Z0-9]{2,}-\d+$|^https?:\/\/|@[\w.-]+\.[a-z]+|^\+?\d[\d\s().-]{4,}$/i;
const HAS_LETTER = /[A-Za-z]/;

function isTranslatable(s: string) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!HAS_LETTER.test(t)) return false;
  if (DATA_RE.test(t)) return false;
  return true;
}

function nodeAllowed(node: Node) {
  let p: Node | null = node.parentNode;
  while (p && p.nodeType === 1) {
    const el = p as HTMLElement;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.getAttribute && el.getAttribute("data-no-translate") !== null) return false;
    if (el.isContentEditable) return false;
    p = el.parentNode;
  }
  return true;
}

function makeTranslator() {
  let currentLang: LangCode = "en";
  let cache: Record<string, string> = {};
  let observer: MutationObserver | null = null;
  const nodes = new Set<Text>();
  const pending = new Set<string>();
  let flushTimer: number | null = null;
  let inFlight = false;

  const loadCache = (lang: Exclude<LangCode, "en">) => {
    try {
      const raw = window.localStorage.getItem(CACHE_PREFIX + lang);
      cache = raw ? JSON.parse(raw) : {};
    } catch {
      cache = {};
    }
    // Merge static seed.
    for (const [k, v] of Object.entries(SEED[lang])) {
      if (!cache[k]) cache[k] = v;
    }
  };

  const saveCache = (lang: Exclude<LangCode, "en">) => {
    try {
      window.localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(cache));
    } catch {
      /* quota — ignore */
    }
  };

  const applyToNode = (node: Text) => {
    if (currentLang === "en") return;
    const orig: string =
      (node as unknown as Record<string, string>)[ORIG_KEY] ?? node.nodeValue ?? "";
    if (!isTranslatable(orig)) return;
    const key = orig.trim();
    const translated = cache[key];
    if (!translated) {
      pending.add(key);
      return;
    }
    if (!(node as unknown as Record<string, string>)[ORIG_KEY]) {
      (node as unknown as Record<string, string>)[ORIG_KEY] = orig;
    }
    // Preserve leading/trailing whitespace.
    const lead = orig.match(/^\s*/)?.[0] ?? "";
    const trail = orig.match(/\s*$/)?.[0] ?? "";
    const next = lead + translated + trail;
    if (node.nodeValue !== next) node.nodeValue = next;
  };

  const collect = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue || !isTranslatable(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (!nodeAllowed(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const tn = n as Text;
      nodes.add(tn);
      applyToNode(tn);
    }
    scheduleFlush(true);
  };

  const restoreAll = () => {
    for (const n of nodes) {
      const o = (n as unknown as Record<string, string>)[ORIG_KEY];
      if (o != null) {
        n.nodeValue = o;
      }
    }
  };

  const scheduleFlush = (immediate = false) => {
    if (currentLang === "en" || pending.size === 0) return;
    if (flushTimer) window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flush, immediate ? 0 : 60);
  };

  const flush = async () => {
    if (currentLang === "en" || inFlight) return;
    const lang = currentLang as "hi" | "mr";
    const batch = Array.from(pending).slice(0, 200);
    if (batch.length === 0) return;
    inFlight = true;
    try {
      const translations = await googleTranslate(batch, lang);
      batch.forEach((src, i) => {
        const out = translations[i];
        if (out && typeof out === "string") cache[src] = out;
        pending.delete(src);
      });
      saveCache(lang);
      // Re-apply to all known nodes.
      for (const n of nodes) applyToNode(n);
    } catch (e) {
      console.warn("translate batch failed", e);
      // Drop this batch so we don't loop forever.
      batch.forEach((s) => pending.delete(s));
    } finally {
      inFlight = false;
      if (pending.size > 0) scheduleFlush();
    }
  };

  const start = (lang: Exclude<LangCode, "en">) => {
    currentLang = lang;
    loadCache(lang);
    nodes.clear();
    pending.clear();
    collect(document.body);
    if (observer) observer.disconnect();
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData" && m.target.nodeType === 3) {
          const tn = m.target as Text;
          // If we caused this change ourselves, the value matches cache — skip.
          const orig = (tn as unknown as Record<string, string>)[ORIG_KEY];
          if (orig && tn.nodeValue !== orig) {
            const translated = cache[orig.trim()];
            const lead = orig.match(/^\s*/)?.[0] ?? "";
            const trail = orig.match(/\s*$/)?.[0] ?? "";
            if (translated && tn.nodeValue === lead + translated + trail) continue;
          }
          // Text changed externally — reset original tracking.
          delete (tn as unknown as Record<string, string>)[ORIG_KEY];
          nodes.add(tn);
          applyToNode(tn);
        } else {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 || n.nodeType === 3) collect(n);
            if (n.nodeType === 3) {
              const tn = n as Text;
              if (tn.nodeValue && isTranslatable(tn.nodeValue) && nodeAllowed(tn)) {
                nodes.add(tn);
                applyToNode(tn);
              }
            }
          });
        }
      }
      scheduleFlush();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const stop = () => {
    currentLang = "en";
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    restoreAll();
    nodes.clear();
    pending.clear();
  };

  return { start, stop };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");
  const [enabled, setEnabled] = useState<LangCode[]>(["en", "hi", "mr"]);
  const translatorRef = useRef<ReturnType<typeof makeTranslator> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (stored && ["en", "hi", "mr"].includes(stored)) setLangState(stored);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("languages" as never)
          .select("name,enabled")
          .returns<Array<{ name: string; enabled: boolean }>>();
        if (!alive || !data) return;
        const codes = data
          .filter((r) => r.enabled)
          .map((r) => NAME_TO_CODE[r.name.trim().toLowerCase()])
          .filter((c): c is LangCode => !!c);
        const uniq = Array.from(new Set<LangCode>(["en", ...codes]));
        setEnabled(uniq);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Drive the DOM translator whenever language changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!translatorRef.current) {
      translatorRef.current = makeTranslator();
    }
    const tr = translatorRef.current;
    document.documentElement.setAttribute("lang", lang);
    if (lang === "en") {
      tr.stop();
    } else {
      tr.stop();
      tr.start(lang);
    }
  }, [lang]);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (s: string) => {
      if (lang === "en") return s;
      const seed = SEED[lang]?.[s];
      if (seed) return seed;
      try {
        const raw = window.localStorage.getItem(CACHE_PREFIX + lang);
        if (raw) {
          const cache = JSON.parse(raw) as Record<string, string>;
          if (cache[s]) return cache[s];
        }
      } catch {
        /* ignore */
      }
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, enabled }), [lang, setLang, t, enabled]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}

export function useT() {
  return useContext(I18nCtx).t;
}
