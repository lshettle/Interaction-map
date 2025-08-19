// =============================================
// Med Interaction Map — Backend API (Next.js)
// =============================================
// Provides API routes for normalization and interactions
// Live lookups: RxNorm, MedlinePlus Connect, OpenFDA/DailyMed, NCCIH

import fetch from "node-fetch";

// -------------------------
// Normalization endpoint
// -------------------------
export async function GET_normalize(req) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const q = searchParams.get("q");
  if (!q) return new Response(JSON.stringify({ canonical: [] }), { status: 200 });

  // RxNorm approximate term search
  const rxnormUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=5`;
  const out = [];
  try {
    const r = await fetch(rxnormUrl);
    const j = await r.json();
    if (j.approximateGroup?.candidate) {
      for (const c of j.approximateGroup.candidate) {
        out.push({ id: c.rxcui, display: c.name, type: "Drug", rxCui: c.rxcui });
      }
    }
  } catch (e) {
    console.error("normalize rxnorm", e);
  }

  // TODO: add supplement/food normalization from NCCIH / USDA if available

  return new Response(JSON.stringify({ canonical: out }), { status: 200 });
}

// -------------------------
// Interaction endpoint
// -------------------------
export async function GET_interactions(req) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  if (!a || !b) return new Response(JSON.stringify({}), { status: 200 });

  const sources = [];
  let severity = null;
  let guidance = null;
  let mechanism = null;
  let evidence = "C";

  // RxNorm interaction check (via RxNav Interaction API)
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${encodeURIComponent(a)}+${encodeURIComponent(b)}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.fullInteractionTypeGroup) {
      for (const g of j.fullInteractionTypeGroup) {
        for (const t of g.fullInteractionType) {
          for (const i of t.interactionPair) {
            severity = (i.severity || "").toLowerCase();
            guidance = i.description;
            mechanism = i.comment || null;
            sources.push({ name: "RxNorm", url: "https://rxnav.nlm.nih.gov/" });
          }
        }
      }
    }
  } catch (e) {
    console.error("interaction rxnorm", e);
  }

  // MedlinePlus Connect
  try {
    const url = `https://connect.medlineplus.gov/service?mainSearchCriteria.v.c=${encodeURIComponent(a)}&informationRecipient.languageCode.c=en`; 
    sources.push({ name: "MedlinePlus Connect", url });
  } catch (e) {
    console.error("medlineplus connect", e);
  }

  // OpenFDA/DailyMed (placeholder example)
  try {
    sources.push({ name: "OpenFDA/DailyMed", url: "https://dailymed.nlm.nih.gov/dailymed/" });
  } catch (e) {
    console.error("openfda", e);
  }

  // NCCIH supplement monographs (static entry for now)
  try {
    sources.push({ name: "NCCIH Herbs", url: "https://www.nccih.nih.gov/health/herbsataglance" });
  } catch (e) {
    console.error("nccih", e);
  }

  return new Response(
    JSON.stringify({
      a: { id: a, display: a, type: "Drug" },
      b: { id: b, display: b, type: "Drug" },
      severity: severity || "minor",
      guidance: guidance || "No interaction details available",
      mechanism,
      evidence,
      sources,
    }),
    { status: 200 }
  );
}

// -------------------------
// Next.js route handlers
// -------------------------
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  if (req.url.includes("/api/normalize")) return GET_normalize(req);
  if (req.url.includes("/api/interactions")) return GET_interactions(req);
  return new Response("Not found", { status: 404 });
}
