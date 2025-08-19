import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Info, ExternalLink, Loader2 } from "lucide-react";

// =============================================
// Med Interaction Map — Final Frontend (UI wired to real APIs)
// =============================================
// Calls your Next.js API routes:
//   • GET /api/normalize?q=term
//   • GET /api/interactions?a=&b=

export type CanonicalType = "Drug" | "Supplement" | "Food";
export type CanonicalItem = { id: string; display: string; type: CanonicalType; rxCui?: string; unii?: string };
export type Severity = "minor" | "moderate" | "major" | "contraindicated";
export type Evidence = "A" | "B" | "C" | "D";
export type SourceRef = { name: string; url: string; snippet?: string; retrieved?: string };
export type InteractionRecord = {
  a: CanonicalItem; b: CanonicalItem;
  severity: Severity; guidance: string; mechanism?: string; evidence: Evidence; sources: SourceRef[]
};

const SEVERITY_STYLES: Record<Severity, string> = {
  minor: "bg-emerald-100 text-emerald-900 border-emerald-300",
  moderate: "bg-amber-100 text-amber-900 border-amber-300",
  major: "bg-rose-100 text-rose-900 border-rose-300",
  contraindicated: "bg-red-600 text-white border-red-700",
};
const TYPE_BADGE: Record<CanonicalType, string> = {
  Drug: "bg-sky-100 text-sky-900 border-sky-300",
  Supplement: "bg-violet-100 text-violet-900 border-violet-300",
  Food: "bg-lime-100 text-lime-900 border-lime-300",
};

async function apiNormalize(q: string): Promise<CanonicalItem[]> {
  const res = await fetch(`/api/normalize?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`normalize: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.canonical) ? json.canonical : [];
}
async function apiInteraction(a: string, b: string): Promise<InteractionRecord | null> {
  const res = await fetch(`/api/interactions?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  if (!res.ok) throw new Error(`interactions: ${res.status}`);
  const json = await res.json();
  if (json && json.severity) return json as InteractionRecord;
  return null;
}

export default function MedInteractionMapFinal() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CanonicalItem[]>([]);
  const [selected, setSelected] = useState<CanonicalItem[]>([]);
  const [active, setActive] = useState<InteractionRecord | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [pairs, setPairs] = useState<Record<string, InteractionRecord | null>>({});

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim();
      if (!q) return setSuggestions([]);
      try {
        setLoadingQuery(true);
        const items = await apiNormalize(q);
        setSuggestions(items.slice(0, 10));
      } catch (e) {
        console.error(e);
        setSuggestions([]);
      } finally {
        setLoadingQuery(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const gridItems = useMemo(() => [...selected].sort((a, b) => a.display.localeCompare(b.display)), [selected]);
  const pairList = useMemo(() => {
    const out: { key: string; a: CanonicalItem; b: CanonicalItem }[] = [];
    for (let i = 0; i < gridItems.length; i++) {
      for (let j = i + 1; j < gridItems.length; j++) {
        const a = gridItems[i];
        const b = gridItems[j];
        out.push({ key: `${a.id}|${b.id}`, a, b });
      }
    }
    return out;
  }, [gridItems]);

  // On-change rechecks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pairList.length === 0) return setPairs({});
      try {
        setLoadingPairs(true);
        const entries = await Promise.all(pairList.map(async (p) => {
          try {
            const rec = await apiInteraction(p.a.display, p.b.display);
            return [p.key, rec] as const;
          } catch (e) {
            console.error(e);
            return [p.key, null] as const;
          }
        }));
        if (!cancelled) {
          setPairs(Object.fromEntries(entries));
        }
      } finally {
        if (!cancelled) setLoadingPairs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pairList.map(p => p.key).join(",")]);

  function addItem(i: CanonicalItem) {
    if (selected.some((s) => s.id === i.id)) return;
    setSelected((prev) => [...prev, i]);
    setQuery("");
    setSuggestions([]);
  }
  function removeItem(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  const NO_KNOWN_TEXT = "no known interaction from these sources";
  const NO_KNOWN_TOOLTIP = "This does not guarantee safety; it means none of the checked sources list an interaction.";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Medication & Supplement Interaction Map</h1>
      <p className="text-sm text-slate-600 mb-6">
        Search your real regimen and see pairwise interactions with direct source links (FDA / NIH / NCCIH).
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <div className="flex items-center gap-2 border rounded-xl px-3 py-2 shadow-sm">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            className="w-full outline-none text-sm"
            placeholder="Search (e.g., \"warfarin\", \"simvastatin\", \"St. John's wort\")"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loadingQuery && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        {query && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border rounded-xl shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                onClick={() => addItem(s)}
              >
                <span className="text-sm">{s.display}</span>
                <span className={`text-xs px-2 py-0.5 border rounded ${TYPE_BADGE[s.type]}`}>{s.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {selected.map((s) => (
          <span key={s.id} className={`inline-flex items-center gap-2 text-xs border rounded-full px-3 py-1 ${TYPE_BADGE[s.type]}`}>
            {s.display}
            <button onClick={() => removeItem(s.id)} className="hover:opacity-70" aria-label={`Remove ${s.display}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-slate-600 sticky left-0 bg-white">Item</th>
              {gridItems.map((col) => (
                <th key={col.id} className="text-xs text-slate-600 px-2 py-1 border-b">{col.display}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gridItems.map((row) => (
              <tr key={row.id}>
                <th className="text-left text-sm font-medium sticky left-0 bg-white pr-2 py-1 border-b">{row.display}</th>
                {gridItems.map((col) => {
                  if (row.id === col.id) return <td key={col.id} className="px-2 py-1 border-b text-center text-slate-300">—</td>;
                  const key = [row.id, col.id].sort().join("|");
                  const ix = pairs[key] || null;
                  const isLoading = loadingPairs && !(key in pairs);
                  const label = ix ? ix.severity : (isLoading ? "…" : NO_KNOWN_TEXT);
                  const titleText = ix ? "Click for guidance and sources" : NO_KNOWN_TOOLTIP;
                  return (
                    <td key={col.id} className="px-2 py-1 border-b">
                      <button
                        className={`w-full text-xs px-2 py-1 border rounded ${ix?.severity ? SEVERITY_STYLES[ix.severity] : "bg-slate-50 text-slate-600"} hover:opacity-90`}
                        onClick={() => ix && setActive(ix)}
                        title={titleText}
                      >
                        {label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {active && (
        <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center bg-black/40 p-4" onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-xs text-slate-500">Interaction</div>
                <div className="text-lg font-semibold">{active.a.display} <span className="text-slate-400">x</span> {active.b.display}</div>
              </div>
              <button className="p-1 rounded hover:bg-slate-100" onClick={() => setActive(null)} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`text-xs px-2 py-1 border rounded ${SEVERITY_STYLES[active.severity]}`}>{active.severity}</span>
              <span className="text-xs px-2 py-1 border rounded bg-slate-50 text-slate-700">Evidence {active.evidence}</span>
            </div>
            <p className="text-sm mb-2"><span className="font-medium">Guidance:</span> {active.guidance}</p>
            {active.mechanism && (<p className="text-sm mb-4"><span className="font-medium">Mechanism:</span> {active.mechanism}</p>)}
            <div className="text-sm">
              <div className="font-medium mb-1 flex items-center gap-2"><Info className="w-4 h-4" /> Sources</div>
              <ul className="list-disc pl-5 space-y-1">
                {active.sources.map((s, i) => (
                  <li key={i}>
                    <a className="text-sky-700 hover:underline inline-flex items-center gap-1" href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        Informational only, not medical advice. Confirm critical interactions with your clinician or pharmacist.
      </div>
    </div>
  );
}
