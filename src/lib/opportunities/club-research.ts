import {
  feeLabel,
  type Profile,
  type Evidence,
} from "@/lib/intelligence/comparison";
export interface ResearchHit {
  title: string;
  text: string;
  source: Evidence;
}
/** Extract only evidence already belonging to the selected club; no external or cross-club search. */
export function clubEvidence(p: Profile): ResearchHit[] {
  return [
    ...p.fees.map((f) => ({
      title: "Published fee observation",
      text: `${feeLabel(f)}. ${f.notes}`,
      source: f.source,
    })),
    ...p.leadership.map((l) => ({
      title: "Leadership / coaching observation",
      text: `${l.name} — ${l.role}. Status: ${l.status ?? "observed"}. Role date: ${l.startDate ?? "not stated"}. ${l.note ?? ""}`,
      source: l.source,
    })),
    ...(p.facts ?? []).map((f) => ({
      title: f.label,
      text: f.value,
      source: f.source,
    })),
    ...p.history.map((h) => ({
      title: "Documented history",
      text: `${h.date}: ${h.event}`,
      source: h.source,
    })),
    ...p.sources.map((s) => ({
      title: "Source observation",
      text: s.note,
      source: s,
    })),
  ].filter((h) => h.text.trim() && /^https?:\/\//i.test(h.source.url));
}
export function searchClubEvidence(
  p: Profile,
  question: string,
): { hits: ResearchHit[]; notice: string } {
  const q = question.trim().toLowerCase();
  if (!q) return { hits: [], notice: "Ask a question or choose a topic." };
  if (/\b(review|reviews|rating|ratings|reputation|yelp)\b/.test(q))
    return {
      hits: [],
      notice:
        "Public reviews are not connected in this version. No rating or parent sentiment is inferred from club-published information.",
    };
  const terms =
    q
      .match(/[a-z0-9]{3,}/g)
      ?.filter(
        (w) =>
          ![
            "the",
            "and",
            "who",
            "what",
            "are",
            "for",
            "does",
            "this",
            "club",
            "about",
            "can",
            "you",
            "tell",
            "please",
          ].includes(w),
      ) ?? [];
  const expanded = new Set(terms);
  if (/fee|cost|price|budget/.test(q))
    ["fee", "cost", "tuition", "price"].forEach((w) => expanded.add(w));
  if (/coach|director|leadership/.test(q))
    ["coach", "director", "leadership"].forEach((w) => expanded.add(w));
  if (/move|movement|promotion|transfer/.test(q))
    [
      "movement",
      "promotion",
      "transfer",
      "placement",
      "evaluation",
      "release",
    ].forEach((w) => expanded.add(w));
  const scored = clubEvidence(p)
    .map((h) => ({
      h,
      score: [...expanded].filter((t) =>
        `${h.title} ${h.text}`.toLowerCase().includes(t),
      ).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const hits = scored
    .map((x) => x.h)
    .filter((h) => {
      const key = h.text + h.source.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  return {
    hits,
    notice: hits.length
      ? "Related saved evidence—not a generated answer or confirmation of current availability. Read the source and date."
      : "No supporting detail found in this club’s saved research. Ask the club directly; missing evidence does not mean a program or policy does not exist.",
  };
}
