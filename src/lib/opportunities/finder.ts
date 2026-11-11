/** Sport-independent intake and evidence matching. No ratings, admission odds or placement predictions. */
export type Goal = "beginner" | "move-up" | "coaching" | "return";
export interface OpportunityIntake {
  sport: string;
  goal: Goal;
  age: string;
  ageGroup: string;
  program: string;
  area: string;
  pathway: string;
  coaching: string[];
  travel: string;
  budget: string;
  availability: string;
  context: string;
}
export interface ResearchClub {
  id: string;
  name: string;
  area: string;
  website: string;
  programs: string[];
}
export function findResearchLeads<T extends ResearchClub>(
  clubs: T[],
  intake: OpportunityIntake,
): T[] {
  const pattern =
    intake.goal === "beginner"
      ? /recreational|grassroots|intro|learn.to.play/i
      : intake.goal === "move-up"
        ? /competitive/i
        : intake.goal === "return"
          ? /recreational|grassroots|competitive/i
          : /development|competitive|academy/i;
  return clubs
    .filter(
      (c) =>
        (!intake.area || c.area === intake.area) &&
        c.programs.some((p) => pattern.test(p)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function buildInquiry(i: OpportunityIntake, clubName?: string): string {
  const text = [
    `Hello${clubName ? ` ${clubName}` : ""},`,
    "",
    `We are exploring ${i.sport} options and would like help finding an appropriate program.`,
    `Our goal: ${{ beginner: "a welcoming introduction for a new player", "move-up": "a more challenging playing pathway", coaching: "a better fit for coaching and development", return: "returning to organized play" }[i.goal]}.`,
    i.age ? `Player age: ${i.age}.` : "",
    i.ageGroup ? `Current age group: ${i.ageGroup}.` : "",
    i.program ? `Program preference: ${i.program}.` : "",
    i.pathway ? `Pathway of interest: ${i.pathway}.` : "",
    i.area ? `Preferred area: ${i.area}.` : "",
    i.travel ? `Travel preference: ${i.travel}.` : "",
    i.budget ? `Budget preference: ${i.budget}.` : "",
    i.availability ? `Availability: ${i.availability}.` : "",
    i.coaching.length
      ? `Development priorities: ${i.coaching.join(", ")}.`
      : "",
    i.context ? `Additional context: ${i.context}` : "",
    "",
    "Which program and age group would you suggest? Please confirm the applicable season, eligibility rules, locations, schedule, total fees and whether spaces or evaluations are currently available.",
    i.goal === "beginner"
      ? "Does the program welcome beginners at this age, and is a taster session available?"
      : "How do evaluations, team placement and movement between teams work?",
    i.pathway
      ? "Please confirm the exact league (including any Regional League distinction), boys’/girls’ team and age group. I understand a club affiliation does not establish an opening."
      : "",
    i.goal === "coaching"
      ? "Who would coach the player, how often is individual feedback provided, and can we observe or try a session?"
      : "",
    "Thank you.",
  ];
  return text.filter(Boolean).join("\n");
}
