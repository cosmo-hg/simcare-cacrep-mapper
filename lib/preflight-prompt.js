// Used only by /api/preflight to convert non-objective input into a list of
// objective-shaped statements. The user reviews the result before it is sent
// to /api/map. This file does not touch the main matching prompt.

export const PREFLIGHT_PROMPT = `You convert raw course text into a list of student learning objectives.

Each objective must:
- Begin with an action verb (Demonstrate, Apply, Recognize, Conduct, Analyze, Identify, Articulate, Develop, Provide, Integrate, Examine, Evaluate, Describe, etc.).
- Be a single complete sentence describing what a student will be able to do or know.
- Cover one distinct learning area; do not merge two ideas into one objective.

If the input is a weekly schedule, write one objective per week, derived from that week's topic.
If the input is a topic list, write one objective per topic.
If the input is a brief course description, infer 3 to 6 objectives that capture the course's intent.
If the input already contains numbered or bulleted objectives, return them verbatim — do not paraphrase.

Stay faithful to the level and discipline of the input. Do not invent topics the source text does not imply. If the source text is sparse, return fewer objectives rather than padding.

Return ONLY a JSON array of strings. No preamble, no markdown fences, no closing remark. Begin with [ and end with ].

Example output:
["Demonstrate active listening skills in counseling sessions.", "Apply the ACA Code of Ethics to clinical dilemmas involving confidentiality."]`;
