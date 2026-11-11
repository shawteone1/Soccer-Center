import type { Profile } from "@/lib/intelligence/comparison";
/** Academic preferences remain independent of sport and are not admissions predictions. */
export interface AcademicPreferences {
  graduation: string;
  interests: string;
  gpa: string;
  budget: string;
  size: string;
  distance: string;
}
export interface CollegeFitIntake {
  academic: AcademicPreferences;
  sport: string;
  gender: string;
  division: string;
  area: string;
  position: string;
  level: string;
  commitment: string;
}
export function collegeLeads(
  profiles: Profile[],
  i: CollegeFitIntake,
): Profile[] {
  return profiles
    .filter(
      (p) =>
        p.kind === "college" &&
        (!i.area || p.area === i.area) &&
        (p.catalogPrograms ?? []).some(
          (r) =>
            (!i.gender || r.gender === i.gender) &&
            (!i.division || r.division === i.division),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function collegeInquiry(i: CollegeFitIntake, name: string): string {
  const a = i.academic;
  return [
    `Hello ${name},`,
    `I am researching academic and ${i.sport} opportunities at your institution.`,
    a.graduation && `Expected high-school graduation: ${a.graduation}.`,
    a.interests && `Academic interests: ${a.interests}.`,
    a.gpa && `Self-reported GPA / scale: ${a.gpa}.`,
    a.budget && `Annual budget preference: ${a.budget}.`,
    a.size && `School-size preference: ${a.size}.`,
    a.distance && `Distance-from-home preference: ${a.distance}.`,
    i.position && `Playing position: ${i.position}.`,
    i.level && `Current playing level: ${i.level}.`,
    i.commitment && `Sport commitment preference: ${i.commitment}.`,
    i.gender &&
      `Program of interest: ${i.gender === "womens" ? "Women’s" : "Men’s"} ${i.sport}.`,
    i.division && `Division of interest: ${i.division}.`,
    "For admissions: could you confirm the relevant majors, current entry requirements, application dates and where to obtain a personalized net-price estimate?",
    `For the ${i.sport} staff: could you explain your recruiting process for my graduation year, current evaluation opportunities and what information you need?`,
    "I understand catalog information does not confirm admission, scholarship eligibility, coach interest or an available roster place.",
    "Thank you.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
