export function buildScoringPrompt(jdText, resumeText) {
  return `You are an expert resume evaluator. Score this resume against the job description on six dimensions.

## Job Description
${jdText}

## Resume
${resumeText}

## Instructions
Base scores solely on what the JD explicitly requires or values. Score each dimension 0–10:
10=Exceptional fit, 8=Strong fit, 6=Plausible fit, 5=Baseline, 4=Weak fit, 2=Very weak fit, 0=Not a match

Each dimension is mutually exclusive — do NOT count the same criterion in more than one dimension.

- duties: How well the resume's work history aligns with the JD's primary duties and responsibilities.
- requirements: How well the resume meets the JD's stated hard requirements — EXCLUDING years-of-experience requirements (scored in years_experience) and industry/sector background requirements (scored in industry). Focus on education, certifications, functional skills, and role-specific qualifications only. Also factor in any explicit timezone/working-hours requirement: the candidate is based in Eastern Time (ET). A requirement for Pacific Time (PT) hours or location is a meaningful gap — score it down noticeably. Central (CT) or Mountain (MT) requirements are only a minor gap — apply a small discount at most. Eastern Time, or no stated timezone requirement, is not a gap at all.
- years_experience: Closeness of match between the candidate's years of relevant experience and the JD's requirement (use midpoint if JD gives a range; overqualified penalizes equally to underqualified). Guide: exact=10, ±1yr=8, ±2yr=6, ±3–4yr=4, 5+yr off=2.
- skills: Match of technical skills, tools, software, and methodologies.
- preferences: How well the resume meets the JD's preferred/nice-to-have qualifications — EXCLUDING years-of-experience preferences and industry/sector background preferences (both scored in their own dimensions). Score 5 if none stated after these exclusions.
- industry: How well the candidate's industry and business-model context matches this role.

For each dimension provide: score (integer 0–10), rationale (1–2 sentences), jd_evidence, resume_evidence, missing (or "None identified"), confidence ("high"/"medium"/"low").

Respond ONLY with valid JSON — no markdown fences:
{
  "duties":           { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
  "requirements":     { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
  "years_experience": { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
  "skills":           { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
  "preferences":      { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
  "industry":         { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" }
}`;
}

export function buildMetadataPrompt(jdText, resumeText, today = new Date().toISOString().slice(0, 10)) {
  return `Extract structured metadata from this job description and compare it against the resume. Respond ONLY with valid JSON — no markdown fences, no commentary.

Today's date is ${today}.

## Job Description
${jdText}

## Resume
${resumeText}

Return exactly this JSON structure:
{
  "company_industry": "string or null",
  "reports_to": "string or null",
  "remote": "Remote" | "Hybrid" | "On-site" | null,
  "job_level": "Analyst"|"Senior Analyst"|"Lead"|"Manager"|"Senior Manager"|"Director"|"Senior Director"|"Assistant VP"|"VP"|"Senior VP"|"EVP" | null,
  "years_experience": number | null,
  "salary_min": number | null,
  "salary_max": number | null,
  "salary_zones": [{ "zone": "string", "min": number, "max": number }] | null,
  "posted_date": "YYYY-MM-DD" | null,
  "meets_requirements": "Yes" | "Partial" | "No",
  "meets_requirements_notes": "one sentence",
  "meets_preferences": "Yes" | "Partial" | "No" | "N/A",
  "meets_preferences_notes": "one sentence"
}

Definitions:
- company_industry: the industry or sector of the company (e.g. "Technology", "Financial Services", "Healthcare"); null if unclear
- reports_to: the title or level this role reports to (e.g. "CFO", "VP of Finance"), from the JD; null if not stated
- remote: work location inferred from JD language; null if not stated
- job_level: seniority level from title and responsibilities; null if unclear
- years_experience: years of experience required per JD; null if not stated. If the JD gives a range (e.g. "5–7 years"), use the midpoint (6).
- salary_min / salary_max: integers in USD; null if not stated. If the JD lists multiple ranges for different locations or zones, use the Florida range if present; otherwise use the national or general range; otherwise use the range for the zone that most plausibly applies to Florida (e.g. Zone 2 or lower-cost regions over Zone 1 / NYC / SF).
- salary_zones: only when the JD explicitly lists two or more distinct geography/zone-based salary ranges (e.g. "Zone 1: $220,000-$330,000, Zone 2: $200,000-$300,000", or separate ranges for "NYC/SF" vs "all other US locations"). One entry per zone, with the JD's own label in "zone" (e.g. "Zone 1 (New York, California, Washington)") and integer USD bounds in "min"/"max". Use null if the JD gives only one general/national range, or no range at all — do not invent zones that aren't explicitly stated.
- posted_date: the calendar date the job was posted, as an absolute "YYYY-MM-DD" date. The JD may state this as an absolute date ("Posted January 5, 2026") or relative to today ("Posted 3 days ago", "30+ days ago") — for relative phrasing, compute the date by counting back from today's date given above. If the JD gives no posting-date information at all, use null.
- meets_requirements: does the resume meet ALL hard requirements ("required", "must have", "minimum")?
- meets_preferences: does the resume meet ALL preferred qualifications ("preferred", "nice to have", "a plus")? Use "N/A" if the JD states none.`;
}

// Maps a job_level to the title of the role one step up the org chart — used when
// reports_to wasn't extracted from the JD, so we can search for likely-manager
// candidates by level instead of by name. Collapses the finer "Senior X" gradations
// (a Manager's boss is a Director in practice far more often than a Senior Manager).
const LEVEL_UP_MAP = {
  'Analyst': 'Manager',
  'Senior Analyst': 'Manager',
  'Lead': 'Manager',
  'Manager': 'Director',
  'Senior Manager': 'Director',
  'Director': 'VP',
  'Senior Director': 'VP',
  'Assistant VP': 'VP',
  'VP': 'Senior VP',
  'Senior VP': 'EVP',
  'EVP': null,
};

export function levelOneUp(jobLevel) {
  return LEVEL_UP_MAP[jobLevel] ?? null;
}

// Renders real Google search results (fetched via Serper, see server/routes/contactSearch.js)
// as primary evidence. Claude's own web_search tool has much weaker LinkedIn coverage than
// Google — LinkedIn blocks most crawlers except Google's — so recent personnel changes
// (promotions, new hires) are far more likely to surface here than via web_search alone.
function renderGoogleResults(googleResults, hasWebSearchTool) {
  if (!googleResults || googleResults.length === 0) return '';
  const lines = googleResults
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet || ''}`)
    .join('\n\n');
  const followUp = hasWebSearchTool
    ? 'You may still use the web_search tool to fill gaps, verify a claim, or find a source page\'s fuller content, but don\'t let it override a clear, recent, well-sourced result found above.'
    : 'You have no further way to verify or expand on these — work only from what\'s here.';
  return `

## Google Search Results (real, current — treat as primary evidence)
${lines}

These came from live Google searches, so they reflect what's actually indexed right now — including recent LinkedIn profile updates that Claude's own web_search tool typically cannot see (LinkedIn blocks most crawlers except Google's). Prioritize names/titles found here. ${followUp}`;
}

// The header instructions and per-mode "how to search" clause both depend on whether
// this provider actually has a live search tool (Anthropic only — see searchWithProvider
// in llm/search.js). Without one, the model can only work from whatever Google results
// (via Serper) were already embedded above, and must be told plainly not to guess from
// memorized training data instead — that's the single biggest risk for tool-less providers.
function researchIntro(hasWebSearchTool) {
  return hasWebSearchTool
    ? 'using real-time web search. Use the web_search tool — and the Google search results below, if provided — to find current, verifiable information. Do not rely on memorized/training-data knowledge alone, since org charts and personnel change frequently.'
    : "using the Google search results below, if provided. You do NOT have a live web search tool yourself — you can only work from those results. Do not rely on memorized/training-data knowledge to guess names, titles, or facts; it is frequently stale or simply wrong for personnel and company details, and this task requires currently-accurate information. If the Google results don't clearly answer the question, say so rather than guessing.";
}

function verifyClause(hasWebSearchTool, capitalized = false) {
  const clause = hasWebSearchTool
    ? 'check the Google results above first, then use web_search for anything still unclear'
    : 'base your answer only on the Google results above — you have no other way to verify this';
  return capitalized ? clause[0].toUpperCase() + clause.slice(1) : clause;
}

export function buildContactSearchPrompt({ mode, company, title, reportsTo, targetTitle, category, googleResults, hasWebSearchTool = true }) {
  const header = `You are a research assistant helping a job applicant identify who they would likely be working for at a company, ${researchIntro(hasWebSearchTool)}

## Company
${company || 'Unknown'}

## Job Title
${title || 'Unknown'}
${category ? `
## Function/Area
${category}
` : ''}${renderGoogleResults(googleResults, hasWebSearchTool)}`;

  const task = mode === 'specific'
    ? `

## Task
This role reports to: "${reportsTo}".

Find the specific person who CURRENTLY holds the "${reportsTo}" role at ${company || 'this company'}. Confirm with a real, citable source — ${verifyClause(hasWebSearchTool)} (LinkedIn, the company's leadership/team pages, press releases, news articles).

Rules:
- Only report a name if you found a real, current, verifiable source for it. Do not guess or infer a name from pattern-matching — if you can't verify it, say so plainly instead.
- If multiple people plausibly hold overlapping or ambiguous titles (e.g. a recent personnel change, or the title exists in more than one division), list each candidate separately with a note explaining the ambiguity.
- Prefer the most recently dated sources you can find; if your best source might be outdated (e.g. an old press release), say so in the note — this person may have since moved on. A recent promotion or hire (even just months ago) is exactly the kind of change to catch, not dismiss.`
    : `

## Task
This role's direct manager's title was not stated in the job description. Based on typical org structure, the manager of a "${title || 'this'}" role is usually one level up${targetTitle ? `: a "${targetTitle}"${category ? ` in ${category}` : ''}` : ', though the exact level is unclear here'}.

Find real people who currently hold${targetTitle ? ` a "${targetTitle}"-level position` : ' a senior leadership position'} in a relevant function at ${company || 'this company'} — i.e., people who could plausibly be this role's hiring manager. ${verifyClause(hasWebSearchTool, true)} (LinkedIn, the company's leadership/team pages, press releases). Return several candidates if more than one plausible person exists (e.g. multiple directors across different teams); it's fine to be inclusive here since we don't know which specific team this role sits in.

Rules:
- Only include people you found a real, current, verifiable source for. Do not invent names.
- If you can't find anyone at that level for this company, say so plainly rather than guessing.`;

  const outputFormat = `

## Output
First, write a brief plain-language summary of what you found (a few sentences — citations are fine here).

Then, on its own line, write the exact marker "RESULTS_JSON:" followed immediately by a single JSON object (no markdown fences, no citations, no commentary after it) in exactly this shape:
{
  "contacts": [
    { "name": "string", "title": "string", "url": "string", "note": "string" }
  ]
}
Use an empty array if nobody could be verified. "note" should briefly explain confidence, ambiguity, or source recency — or, if the array is empty, why no one was found.`;

  return header + task + outputFormat;
}

// The "what to look for and how to write it" guidance is intentionally NOT hard-coded
// here — it's user-editable data (Settings > company_research_instructions, surfaced
// in the Cover Letters tab) so the user can change what kind of material this looks for
// and how the hook is written without a code change. This function only supplies the
// mechanical/structural scaffolding (context, search grounding, output format) and the
// non-negotiable factual-integrity rules, which stay fixed regardless of instructions.
export function buildCompanyResearchPrompt({ company, title, category, googleResults, hasWebSearchTool = true, instructions }) {
  return `You are a research assistant helping a job applicant research a company to find material they can reference in a cover letter, ${researchIntro(hasWebSearchTool)}

## Company
${company || 'Unknown'}

## Job Title
${title || 'Unknown'}
${category ? `
## Function/Area
${category}
` : ''}${renderGoogleResults(googleResults, hasWebSearchTool)}

## Task
Research ${company || 'this company'} and find one or more things a job applicant could authentically reference in a cover letter to show they've done their homework. ${verifyClause(hasWebSearchTool, true)}.

## What to Look For and How to Write It
${instructions?.trim() || 'Find something notable and verifiable about the company, and write a short first-person paragraph, ready to paste into a cover letter, that references it and explains genuine interest in the role.'}

Non-negotiable rules (these apply regardless of the instructions above):
- Only use things you found a real, current, verifiable source for. Do not invent facts, numbers, dates, or events.
- Do not copy sentences verbatim from the source — each paragraph must be original prose synthesizing the fact into cover-letter voice.
- Return fewer entries rather than padding with weak or stale material — quality over quantity. An empty array is fine if nothing solid was found.

## Output
First, write a brief plain-language summary of what you found (a few sentences — citations are fine here).

Then, on its own line, write the exact marker "RESULTS_JSON:" followed immediately by a single JSON object (no markdown fences, no citations, no commentary after it) in exactly this shape:
{
  "findings": [
    { "event": "short label, e.g. 'Series C funding round, $45M, announced June 2026'", "paragraph": "string", "url": "string", "source_title": "string", "date": "approximate date if known, else empty string" }
  ]
}`;
}

// Renders a prior evaluation (scores, rationale, gaps, meets_requirements/preferences,
// job-specific fields) as readable text so the cover letter prompt — and, transitively,
// the user's template/instructions — can reference specific findings from it
// (e.g. "address the years-of-experience gap the evaluation flagged").
export function buildEvaluationSummary(evaluation) {
  if (!evaluation) return '';

  const s = evaluation.score_details || {};
  const dims = [
    ['Duties Match', evaluation.score_duties, s.duties],
    ['Requirements Match', evaluation.score_requirements, s.requirements],
    ['Years of Experience', evaluation.score_years_experience, s.years_experience],
    ['Skills/Keywords', evaluation.score_skills, s.skills],
    ['Preferences Match', evaluation.score_preferences, s.preferences],
    ['Industry/Business Model Fit', evaluation.score_industry, s.industry],
  ];

  const dimLines = dims
    .filter(([, score]) => score != null)
    .map(([label, score, detail]) => {
      const gap = detail?.missing && !/^none/i.test(detail.missing) ? ` | Gap: ${detail.missing}` : '';
      return `- ${label}: ${score}/10 — ${detail?.rationale || '(no rationale)'}${gap}`;
    })
    .join('\n');

  const fieldEntries = Object.entries(evaluation.field_values || {}).filter(([, v]) => v.jd !== 'N/A');
  const fieldLines = fieldEntries
    .map(([k, v]) => `- ${k}: JD wants "${v.jd}"${v.resume && v.resume !== 'N/A' ? ` | Resume shows "${v.resume}"` : ' | Not evidenced in resume'}`)
    .join('\n');

  return `Level: ${evaluation.job_level || '—'} | Remote: ${evaluation.remote || '—'} | Industry: ${evaluation.company_industry || '—'} | Reports to: ${evaluation.reports_to || '—'}
Years required: ${evaluation.years_experience ?? '—'}
Meets requirements: ${evaluation.meets_requirements || '—'}${evaluation.meets_requirements_notes ? ` (${evaluation.meets_requirements_notes})` : ''}
Meets preferences: ${evaluation.meets_preferences || '—'}${evaluation.meets_preferences_notes ? ` (${evaluation.meets_preferences_notes})` : ''}

Score breakdown:
${dimLines || '(no scores available)'}${fieldLines ? `

Job-specific fields evaluated:
${fieldLines}` : ''}`;
}

export function buildCoverLetterPrompt(jdText, resumeText, templateText, company, title, additionalInstructions = '', evaluationSummary = '') {
  return `You are an expert cover letter writer. Write a cover letter for the job below, using the resume as the source of truth for the candidate's background, and following the provided template's structure and instructions.

## Company
${company || 'Unknown'}

## Job Title
${title || 'Unknown'}

## Job Description
${jdText}

## Resume
${resumeText}
${evaluationSummary?.trim() ? `
## Job Evaluation (prior analysis of this candidate against this JD — reference specific strengths or gaps from here if the template or instructions call for it)
${evaluationSummary.trim()}
` : ''}
## Template
${templateText}
${additionalInstructions?.trim() ? `
## Additional Instructions (objective, tone, and other guidance for this template — follow these carefully; they take precedence over the template if they conflict)
${additionalInstructions.trim()}
` : ''}
## Instructions
- The template above may contain structural guidance, section descriptions, tone notes, or bracketed placeholders — follow its structure, section order, and any explicit instructions it contains.
- Fill in placeholder/described sections using specific, true details drawn from the resume and JD. Do not invent skills, employers, achievements, or facts not present in the resume.
- Tailor the content to this specific job and company — reference the company name and role naturally where appropriate.
- If the template or Additional Instructions reference the evaluation (e.g. a specific score, gap, or field), use the Job Evaluation section above to ground that reference in specifics — do not invent findings that aren't there.
- Apply the Additional Instructions above (objective, tone of voice, etc.) throughout the letter.
- Do not reproduce the template's own instructions or meta-commentary in the output — output only the finished, ready-to-send cover letter.
- Do not wrap the output in markdown fences, headings, or add commentary before/after the letter.

Respond with ONLY the finished cover letter text.`;
}

const JOB_LEVELS = [
  'Analyst', 'Senior Analyst', 'Lead', 'Manager', 'Senior Manager',
  'Director', 'Senior Director', 'Assistant VP', 'VP', 'Senior VP', 'EVP',
];

export function buildEvaluationPrompt(jdText, resumeText, existingFields, categoryName, includeSuggestions = false, useFieldDb = true, today = new Date().toISOString().slice(0, 10)) {
  // useFieldDb=false: skip the field database — LLM identifies dimensions independently from JD/resume,
  //   field_values is still returned but new_fields is omitted so the database stays unchanged.
  // useFieldDb=true (default): send existing fields list, map to it, potentially create new fields.
  // The default for FP&A is set to false by the caller; the checkbox on Evaluate tab can override either way.
  const isFpA = !useFieldDb;

  const fieldsList =
    existingFields.length > 0
      ? existingFields.map((f) => `- ${f.name}${f.description ? `: ${f.description}` : ''}`).join('\n')
      : 'None yet — you will establish the initial fields for this category.';

  return `You are an expert resume evaluator. Analyze the job description and resume below, then return a structured JSON evaluation.

Today's date is ${today}.

## Resume Category: "${categoryName}"
${isFpA ? '' : `
## Existing Fields for This Category
${fieldsList}
`}
## Job Description
${jdText}

## Resume
${resumeText}

## Your Task

### 1. Extract Job Description Metadata
Extract the following:
- company: company name, or null
- title: job title, or null
- salary_min / salary_max: integers in USD, or null if not stated
- salary_zones: only when the JD explicitly lists two or more distinct geography/zone-based salary ranges (e.g. "Zone 1: $220,000-$330,000, Zone 2: $200,000-$300,000", or separate ranges for "NYC/SF" vs "all other US locations"). Return an array of { "zone": "<the JD's own label, e.g. 'Zone 1 (New York, California, Washington)'>", "min": <integer USD>, "max": <integer USD> }, one entry per zone. Use null if the JD gives only one general/national range, or no range at all — do not invent zones that aren't explicitly stated.
- years_experience: numeric years required, or null if not stated. If the JD gives a range (e.g. "5–7 years"), use the midpoint (6).
- company_industry: the industry or sector of the company (e.g. "Technology", "Financial Services", "Healthcare", "Consumer Goods", "Media & Entertainment", "Real Estate"). Infer from JD context; null if unclear.
- reports_to: the title or level this role reports to (e.g. "CFO", "VP of Finance", "Director of Operations"), extracted verbatim or inferred from the JD. Null if not stated.
- remote: work location type. Choose exactly one: "Remote", "Hybrid", "On-site", or null if not stated.
- job_level: the seniority level of the role. Choose exactly one from this list, or null if unclear:
  ${JOB_LEVELS.map((l) => `"${l}"`).join(', ')}
- meets_requirements: does the resume meet ALL stated hard requirements (language like "required", "must have", "minimum", "essential")?
  Use "Yes", "Partial", or "No".
- meets_requirements_notes: one sentence justifying meets_requirements, naming any gaps.
- meets_preferences: does the resume meet ALL stated preferred qualifications (language like "preferred", "nice to have", "desired", "a plus")?
  Use "Yes", "Partial", or "No". Use "N/A" if the JD states no preferences.
- meets_preferences_notes: one sentence justifying meets_preferences.
- posted_date: the calendar date the job was posted, as an absolute "YYYY-MM-DD" date. The JD may state this as an absolute date ("Posted January 5, 2026") or relative to today ("Posted 3 days ago", "30+ days ago") — for relative phrasing, compute the date by counting back from today's date given above. Null if the JD gives no posting-date information at all.

### 2. Field Analysis

${isFpA
  ? `Identify the key dimensions on which this JD evaluates candidates (e.g. specific technical skills, industry experience, team leadership, FP&A tools, etc.). Work independently from the JD and resume — do not reference any external field database. For each dimension the JD actually addresses, record what the JD requires and what the resume shows.`
  : `**Primary rule — strongly prefer existing fields.** Use an existing field even if its description was written from a different angle or industry. A broad field like "Healthcare Industry Experience" should absorb all variants (healthcare services, healthcare benefits, clinical FP&A, etc.). Only create a new field when no existing field comes close.

**Creating new fields:**
- Create at most 3 new fields per evaluation.
- A new field must be general and reusable across many future job descriptions — not a sub-type of something that already exists.
- Never create a near-duplicate: if the concept exists under any name in the field list, use that field.

**Mandatory consolidation rules for common over-proliferated types:**
- **AI/automation in finance:** At most two fields total should ever exist for this concept — one covering any level of AI tool usage in daily finance work (curiosity through expert daily use), and one covering building AI workflows or agents. Never create separate fields for different proficiency levels (enthusiast, practitioner, power user, etc.) or different tool names.
- **Industry experience:** Use the broadest applicable existing industry field. Never create sub-industry variants (e.g., if "Healthcare Industry Experience" exists, do NOT create "Healthcare Payor Experience" or "Healthcare Services FP&A Experience" — use the existing field and capture the sub-type in the jd value).
- **People/team management:** One general field covers all forms — FP&A team, remote team, coaching, development. Do not create separate management fields by team type or style.
- **PE/VC-backed experience:** One field for working in a PE-backed company. Only create a second if the JD explicitly requires PE deal execution skills.
- **Board/executive communication:** One field for materials preparation, one for verbal/presentation delivery. Do not create additional variants.`}

**Recording field values:**
- Only include a field in field_values if the JD actually mentions it (not N/A).
- Omit fields entirely when the JD does not address them — do NOT write {"jd": "N/A", "resume": "N/A"} entries.
- For included fields, record:
  - "jd": What the JD says about this dimension (quote or paraphrase).
  - "resume": Specific evidence from the resume, or "N/A" if absent.

### 3. Score the Resume Against the JD
Base scores solely on what the JD explicitly requires or values. If the JD does not mention a dimension, the resume's performance on it should neither help nor hurt the score — score that dimension on general fit only if the JD provides enough context to judge.

**Scoring scale — apply these anchors strictly. Score inflation is a critical error.**
- 10 = Near-perfect match. Requirement explicitly met with specific, detailed resume evidence. No meaningful gaps.
- 8 = Strong match. All primary criteria met; at most minor gaps in secondary criteria.
- 7 = Good match with one clear but minor gap (e.g. one missing preferred skill, one year short).
- 6 = Plausible match. Meets most core criteria but has 1–2 meaningful gaps a recruiter would notice.
- 5 = Neutral baseline. Strengths and gaps are roughly balanced; fit is genuinely ambiguous.
- 4 = Weak fit. Meets some criteria but is missing important ones the JD emphasizes.
- 2 = Poor fit. Most criteria unmet; any overlap is superficial.
- 0 = No meaningful match.

**Calibration rules (follow these precisely):**
- Default to 5, not 6 or 7, whenever evidence is absent, vague, or ambiguous.
- Do not score above 5 if the resume offers no specific evidence for the dimension.
- Do not score 8+ if the JD states explicit requirements the resume does not meet.
- Do not score higher simply because the candidate is "close" or "could probably do it."
- Odd scores (7, 9) are valid — use them when a score clearly falls between two anchors.

**No double-counting rule:** Each criterion belongs to exactly one dimension. Do not penalize or reward the same criterion in multiple dimensions.
- Years-of-experience requirements ("5+ years", "minimum 3 years", etc.) → scored ONLY in years_experience. Exclude from requirements and preferences.
- Industry/sector background ("healthcare industry experience required", "financial services preferred", etc.) → scored ONLY in industry. Exclude from requirements and preferences.
- Technical skills and tools → scored ONLY in skills. Exclude from requirements and preferences unless the JD explicitly lists a skill as a hard requirement with no skill-specific score available (rare).

Dimensions:
- duties: How well the resume's work history aligns with the JD's primary duties and responsibilities.
- requirements: How well the resume meets the JD's stated hard requirements — after excluding years-of-experience requirements and industry/sector requirements (those are covered in their own dimensions). Focus on education, certifications, functional qualifications, and any remaining role-specific hard requirements. Also factor in any explicit timezone/working-hours requirement: the candidate is based in Eastern Time (ET). A requirement for Pacific Time (PT) hours or location is a meaningful gap — score it down noticeably. Central (CT) or Mountain (MT) requirements are only a minor gap — apply a small discount at most. Eastern Time, or no stated timezone requirement, is not a gap at all.
- years_experience: Closeness of match between the candidate's years of relevant experience and what the JD requires. If the JD gives a range, compare against the midpoint. Score on proximity, not on "meets or exceeds" — being significantly overqualified is penalized just as underqualified is. Use this as a guide: exact match = 10, within 1 year = 8, within 2 years = 6, within 3–4 years = 4, 5+ years off = 2, no relevant experience = 0. If years are not stated in the JD, score on general seniority fit.
- skills: Match of technical skills, tools, software, and methodologies.
- preferences: How well the resume aligns with the JD's preferred/nice-to-have qualifications (language like "preferred", "nice to have", "desired", "a plus", "bonus") — after excluding any years-of-experience preferences and industry/sector preferences (covered in their own dimensions). If the JD states no explicit preferences after these exclusions, set score to null — it will be excluded from the overall score entirely.
- industry: How well the candidate's industry and business-model context matches this role.

For each score provide:
- score (integer 0–10)
- rationale (1–2 sentences)
- jd_evidence (specific text from the JD)
- resume_evidence (specific text from the resume)
- missing (key gaps or "None identified")
- confidence ("high", "medium", or "low")

## Output Format
Respond ONLY with valid JSON — no markdown fences, no commentary. Use exactly this structure:

{
  "scores": {
    "duties":           { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
    "requirements":     { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
    "years_experience": { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
    "skills":           { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
    "preferences":      { "score": null, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" },
    "industry":         { "score": 0, "rationale": "", "jd_evidence": "", "resume_evidence": "", "missing": "", "confidence": "" }
  },
  "metadata": {
    "company": "string or null",
    "title": "string or null",
    "salary_min": number or null,
    "salary_max": number or null,
    "salary_zones": [{ "zone": "string", "min": number, "max": number }] or null,
    "years_experience": number or null,
    "company_industry": "string or null",
    "reports_to": "string or null",
    "remote": "Remote|Hybrid|On-site|null",
    "job_level": "one of the listed levels, or null",
    "posted_date": "YYYY-MM-DD or null",
    "meets_requirements": "Yes|Partial|No",
    "meets_requirements_notes": "string",
    "meets_preferences": "Yes|Partial|No|N/A",
    "meets_preferences_notes": "string"
  }${isFpA ? '' : `,
  "new_fields": [
    { "name": "Field Name", "description": "What this field captures" }
  ]`},
  "field_values": {
    "Field Name": { "jd": "...", "resume": "..." }
  }${includeSuggestions ? `,
  "resume_suggestions": [
    {
      "type": "rewrite",
      "section": "section name (e.g. 'Work Experience – Company, Dates')",
      "current": "exact existing bullet or phrase from the resume",
      "suggested": "improved version",
      "rationale": "why this raises the score against this JD",
      "score_dimension": "duties|requirements|skills|preferences|industry|years_experience"
    }
  ]` : ''}
}${includeSuggestions ? `

### 4. Resume Improvement Suggestions
Analyze each scoring dimension and identify the highest-impact changes the candidate could make to this resume to improve their score for this specific JD. Output these as the "resume_suggestions" array above.

Rules — follow these precisely:
- Assume the resume is fundamentally true. Only suggest changes that are plausible given what is already in the resume. Do NOT invent skills, companies, roles, or achievements not implied by existing content.
- Do NOT suggest changes to the overall resume structure (e.g., do not suggest adding a summary section, changing the resume format, reordering major sections, or changing the resume to a different style).
- DO suggest:
  - **rewrite**: A specific bullet or phrase that could be reworded to better emphasize relevance to this JD (always include both "current" and "suggested").
  - **add**: A bullet or detail the candidate could add within an existing section, based on experience or skills plausibly implied by the resume (include "suggested" only; no "current").
  - **delete**: A bullet or section that wastes space and does not help for this JD (include "current" only; no "suggested").
  - **reorganize**: Moving bullets within a section so the most JD-relevant ones appear first (include both "current" describing what moves and "suggested" describing the new order/placement).
- Provide at most 8 suggestions, prioritized by score impact — highest impact first.
- Each suggestion must reference a specific section by name (e.g., "Work Experience – ABC Corp, 2022–2024").
- Keep "current" quoted verbatim from the resume when possible.` : ''}`;
}
