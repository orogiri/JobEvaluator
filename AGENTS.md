I want to build an app to help me identify which jobs are worth applying for, by evaluating my chances of getting an interview, which is based on how well my resume meets the duties and requirements of a job description.

This app will take in a job description as an input provided by the user. 

An LLM (ChatGPT or Claude) will then break down the job description into its components - e.g., company name, title, years of experience required, salary range, different types of experiences asked for, etc. These components will then become fields, and each field can be directly compared across job descriptions. Such fields should persist per resume-category, not globally.

As the LLM ingests more job descriptions, it will expand its number of fields, when it gets a job description that has a unique requirement, and it will accurately categorize the components of each job description into each field.

If the field was not identified in prior job descriptions, that field didn't exist in prior job descriptions. Each job description need not necessarily have to populate each field. For example, if a field is "assist GTM teams" and a job description doesn't mention that, then the field is simply "N/A".

The LLM will similarly break down the resume into components and categorize to the same fields. The LLM will then compare the resume to the job description on each field. The LLM will evaluate how much of a match the job description, and create an overall score, thus evaluating the chances of getting an interview, based on these sub-score categories: 
- Duties match: 20%
- Requirements match: 20% 
- Required years of experience match: 10%
- Skill / Keyword Match: 20%
- Industry / Business Model Fit: 20%

Scores will be x/10. Each score is justified by the following.
10 = Exceptional fit; very strong interview odds and highly attractive role 
8 = Strong fit; worth prioritizing
6 = Plausible fit; apply if reasonably attractive or easy
5 = Baseline; neither especially strong nor especially weak
4 = Weak fit; probably not worth applying without a referral
2 = Very weak fit
0 = Clearly not a match

Every score should include:
- Rationale
- Evidence from the job description
- Evidence from the resume
- Missing requirements
- Confidence level

Give the user the ability to change the weights in the app, so all scores can automatically recalculate for all job descriptions in archive.

When the user submits a job description, while a submitted resume is selected (user can select from multiple of submitted resumes to compare to), the user will see the score, sub-scores, and a comparison by fields, showing how the score was calculated.

Depending on what resume is selected, the job description will be categorized the same. For example, let's say a user gives a resume the category "IR". Then, each job description will be given the same category "IR". Multiple resumes can be given the same category, to accomodate for resume versioning.

On a separate tab, the user will see a list of all job descriptions submitted historically. The app will rank order the job descriptions from best fit to lowest fit. The user can sort between overall score and sub-scores, years of experience, salary range mid-point, etc. The user can filter job descriptions based on fields - e.g., what jobs ask for experience supporting GTM teams, what jobs ask for experience in forecasting, resume-category type (e.g., "IR"), etc.

The job descriptions, resumes, and everything else will need to be stored into a local database, so that the data, rankings, etc, are persistent as the app closes and npm run dev.

Add the ability to switch between models on both Claude and ChatGPT (e.g., Sonnet vs Opus). Show an estimate of the expected API usage cost, before the user submits the job description.

I'll be adding more feature functionality over time, so architect with that in mind.