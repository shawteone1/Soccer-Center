export default function ExploreCompareEntry() {
  return (
    <section
      aria-labelledby="explore-compare-title"
      className="max-w-6xl mx-auto px-6 pt-12"
    >
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{
          background: "hsl(var(--card))",
          borderColor: "hsl(var(--border))",
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "hsl(var(--primary))" }}
        >
          COLORADO · EXPLORE & COMPARE
        </p>
        <h2
          id="explore-compare-title"
          className="font-heading text-3xl sm:text-4xl font-bold"
        >
          More than a directory. Know your options.
        </h2>
        <p
          className="mt-3 mb-6 max-w-3xl"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Explore club leadership, college programs, published costs and dated
          research. Compare up to three profiles and share your shortlist.
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            ["/research/colorado", "Explore Colorado clubs"],
            ["/research/colorado?kind=college", "Explore Colorado colleges"],
            ["/research/colorado?finder=1", "Find my next opportunity"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex items-center min-h-11 px-5 py-3 rounded-xl border font-semibold"
              style={{
                borderColor: "hsl(var(--primary))",
                color: "hsl(var(--primary))",
              }}
            >
              {label} →
            </a>
          ))}
        </div>
        <p
          className="text-sm mt-5"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Initial Colorado coverage. Research gaps and source dates remain
          visible; listings are not rankings or endorsements.
        </p>
      </div>
    </section>
  );
}
