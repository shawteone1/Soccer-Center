const ncaa = "https://www.ncaa.org/eligibility-center/";
function Resource({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}
export default function RecruitingGuide() {
  return (
    <div className="rh-guide">
      <section className="rh-card">
        <p className="rh-eyebrow">YOUR RECRUITING JOURNEY</p>
        <h2>Start with fit. Build a plan.</h2>
        <p>
          Find a school you would want to attend even without soccer. Use
          academics, affordability, location and the soccer environment to shape
          your shortlist.
        </p>
        <p className="rh-note">
          Guide reviewed November 7, 2026. General planning guidance for
          high-school recruits, not an eligibility decision or a complete rules
          calendar. Transfers, international students and nontraditional
          schooling need individual guidance from the school’s compliance
          office.
        </p>
      </section>
      <section className="rh-card">
        <h2>A practical high-school roadmap</h2>
        <p>
          Suggested preparation stages—not deadlines or permission for coaches
          to contact a player.
        </p>
        <ol className="rh-roadmap">
          <li>
            <strong>Grades 9–10 · Set the foundation</strong>
            <p>
              Review core courses with your counselor. Record graduation year,
              position and team details. Keep a few useful clips and complete
              match footage. Explore schools across divisions and discuss a
              realistic family budget.
            </p>
          </li>
          <li>
            <strong>Grade 10 · Build your shortlist</strong>
            <p>
              Compare majors, location, costs and program level. Ask your coach
              for an honest assessment. Check current staff pages and program
              questionnaires. Choose camps for a clear purpose; confirm who is
              attending before paying.
            </p>
          </li>
          <li>
            <strong>Grade 11 · Start focused conversations</strong>
            <p>
              Check the applicable contact and visit rules. Personalize outreach
              with your profile, film and upcoming appearances. Ask about roster
              needs, academic support and next steps. Track responses and keep
              your list open.
            </p>
          </li>
          <li>
            <strong>Grade 12 · Confirm the details</strong>
            <p>
              Complete school applications and aid forms on each institution’s
              timeline. Compare written costs and offers. Finish certification
              tasks, submit final records and confirm admission, aid and roster
              status directly with the school.
            </p>
          </li>
        </ol>
        <Resource href="https://www.ncsasports.org/recruiting/how-to-get-recruited/college-recruiting-process">
          NCSA practical recruiting guide
        </Resource>
        <p className="rh-note">
          NCSA is a commercial recruiting service and an educational resource,
          not the NCAA eligibility authority. A paid recruiting service is not
          required for NCAA certification.
        </p>
      </section>
      <section className="rh-card">
        <h2>NCAA Eligibility Center / Clearinghouse</h2>
        <p>
          The NCAA Eligibility Center is the current name for the former
          Clearinghouse. Your Soccer Center profile does not register you with
          it.
        </p>
        <ol>
          <li>
            Choose the appropriate NCAA account. Division I/II prospects
            generally need Academic and Athletics Certification; exploring
            families can review the Profile Page option. Division III domestic
            and international paths differ.
          </li>
          <li>
            Work with your counselor to check NCAA-approved core courses. A
            school GPA and an NCAA core-course GPA are not necessarily the same.
          </li>
          <li>
            Keep sports-participation information and enrollment plans current;
            check account tasks and arrange official transcripts through your
            school.
          </li>
          <li>
            Request final athletics certification when eligible, then provide
            the final transcript and graduation proof. Keep your NCAA ID and
            login private.
          </li>
        </ol>
        <Resource href={`${ncaa}register/`}>
          Choose an account or sign in
        </Resource>
        {" · "}
        <Resource href={`${ncaa}resources-for-high-schools/`}>
          Counselor and core-course resources
        </Resource>
        <div className="rh-grid">
          <article>
            <h3>Division I</h3>
            <p>
              16 approved core-course credits; minimum 2.3 core-course GPA. The
              10/7 progression rule requires 10 core courses, including seven in
              English, math or science, before senior year. This is only a
              summary of initial requirements.
            </p>
            <Resource
              href={`${ncaa}initial-eligibility-requirements/division-i/`}
            >
              Official DI requirements
            </Resource>
          </article>
          <article>
            <h3>Division II</h3>
            <p>
              16 approved core-course credits and minimum 2.2 core-course GPA,
              plus required academic and athletics certification. Confirm the
              full requirements and course distribution.
            </p>
            <Resource
              href={`${ncaa}initial-eligibility-requirements/division-ii/`}
            >
              Official DII requirements
            </Resource>
          </article>
          <article>
            <h3>Division III</h3>
            <p>
              Schools set admissions standards. No athletics scholarships; other
              aid may be available. Domestic prospects use a Profile Page;
              international prospects need athletics certification.
            </p>
            <Resource
              href={`${ncaa}initial-eligibility-requirements/division-iii/`}
            >
              Official DIII requirements
            </Resource>
          </article>
        </div>
        <p className="rh-note">
          Meeting an NCAA minimum does not guarantee admission, a roster place
          or a scholarship. Confirm school-specific testing and admissions
          requirements separately.
        </p>
      </section>
      <section className="rh-card">
        <h2>Dates & eligibility checkpoints</h2>
        <p>
          These are selected milestones, not a personalized calendar. School
          year, division, sport, enrollment plans and recruiting periods affect
          what is allowed. Recheck the official source before acting.
        </p>
        <div className="rh-table-wrap">
          <table>
            <caption>Selected milestones · checked November 7, 2026</caption>
            <thead>
              <tr>
                <th>When</th>
                <th>Applies to</th>
                <th>What it means</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>June 15 after sophomore year</th>
                <td>
                  NCAA Division I general correspondence rule, including soccer
                </td>
                <td>
                  Start of permitted recruiting electronic correspondence under
                  the general rule, subject to applicable exceptions. This is
                  not permission for all visits or in-person contact.{" "}
                  <Resource href="https://web3.ncaa.org/lsdbi/reports/pdf/searchPdfView?businessCode=BYLAW_SEARCH_VIEW&id=114036">
                    NCAA rule 13.4.1
                  </Resource>
                </td>
              </tr>
              <tr>
                <th>November 11, 2026</th>
                <td>
                  2026–27 NCAA DI/DII “all other sports” signing category,
                  including soccer
                </td>
                <td>
                  Initial athletics-aid signing date for applicable prospects;
                  the final date depends on institutional policy. Not a college
                  application deadline; four-year transfers have different
                  rules.{" "}
                  <Resource href={`${ncaa}recruiting/`}>
                    Official signing dates
                  </Resource>
                </td>
              </tr>
              <tr>
                <th>April 1 before fall enrollment</th>
                <td>Applicable NCAA certification accounts</td>
                <td>
                  First opportunity to request final athletics certification for
                  the upcoming fall enrollment—not a completion deadline.{" "}
                  <Resource href={`${ncaa}initial-eligibility-requirements/`}>
                    Official certification timing
                  </Resource>
                </td>
              </tr>
              <tr>
                <th>October 1 before winter/spring enrollment</th>
                <td>Applicable NCAA certification accounts</td>
                <td>
                  Request final athletics certification for the upcoming
                  winter/spring enrollment; confirm your account’s enrollment
                  period.{" "}
                  <Resource href={`${ncaa}register/`}>
                    Official account guidance
                  </Resource>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Contact, evaluation, quiet and dead periods</h3>
        <p>
          Contact periods permit certain in-person recruiting; evaluation
          periods limit off-campus conversations. Quiet periods restrict
          off-campus recruiting; dead periods prohibit in-person recruiting and
          evaluations. Some calls or messages may still be permitted. Check the
          current soccer calendar for your division and men’s/women’s program.
        </p>
        <Resource href={`${ncaa}recruiting/`}>
          NCAA current recruiting calendars
        </Resource>
        <p className="rh-note">
          Admissions, financial aid, camp registration and athletics signing
          have separate deadlines. Add confirmed personal dates to your
          calendar; this guide does not auto-sync deadlines.
        </p>
      </section>
      <section className="rh-card">
        <h2>Other pathways & useful reading</h2>
        <div className="rh-grid">
          <article>
            <h3>NAIA</h3>
            <p>
              A separate eligibility process. Use the official NAIA portal and
              confirm requirements with the program.
            </p>
            <Resource href="https://play.mynaia.org/">
              PlayNAIA Eligibility Center
            </Resource>
          </article>
          <article>
            <h3>Soccer-specific guidance</h3>
            <p>
              Plain-language preparation and recruiting advice. Verify rule
              dates against NCAA sources.
            </p>
            <Resource href="https://www.ncsasports.org/mens-soccer/how-to-get-recruited">
              NCSA men’s soccer guide
            </Resource>
            <br />
            <Resource href="https://www.ncsasports.org/womens-soccer/recruiting-rules-calendar">
              NCSA women’s soccer guide
            </Resource>
          </article>
          <article>
            <h3>Two-year and other programs</h3>
            <p>
              Ask the college’s admissions and athletics compliance teams which
              association rules apply, how eligibility is certified and how
              credits transfer. Do not apply NCAA dates to every program.
            </p>
          </article>
        </div>
      </section>
      <section className="rh-card">
        <h2>Before an email, camp or visit</h2>
        <ul>
          <li>
            Confirm the current coach and staff page; old records can remain
            online after a coaching change.
          </li>
          <li>
            Include graduation year, position, a short personal introduction and
            only the profile or film you intend to share.
          </li>
          <li>
            Ask which recruiting class and positions the program is evaluating;
            roster numbers do not prove an opening.
          </li>
          <li>
            Check camp price, refund policy, location and attending staff. A
            camp invitation is not a roster offer.
          </li>
          <li>
            Ask about the full net cost, renewal terms, academic fit and
            support—not just the headline scholarship.
          </li>
        </ul>
        <a href="/camps?from=parent">Browse camp resources →</a>
      </section>
    </div>
  );
}
