import { CACREP_STANDARDS } from '@/lib/cacrep-standards';
import { SIMCARE_COURSES } from '@/lib/simcare-courses';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

function cleanKey(raw) {
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}
function loadKeys() {
  const multi = (process.env.GROQ_API_KEYS || '')
    .split(',')
    .map(cleanKey)
    .filter(Boolean);
  if (multi.length > 0) return multi;
  const single = cleanKey(process.env.GROQ_API_KEY || '');
  return single ? [single] : [];
}

function looksLikeSyllabus(text) {
  const t = text.toLowerCase();
  return [
    'objective',
    'students will',
    'student will',
    'by the end of',
    'learning outcome',
    'course goal',
    'demonstrate',
    'apply',
    'syllabus',
  ].filter((needle) => t.includes(needle)).length >= 2;
}

let cursor = 0;

function cleanJsonResponse(rawText) {
  let clean = rawText.replace(/```json|```/g, '').trim();
  const arrayStart = clean.indexOf('[');
  const arrayEnd = clean.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    clean = clean.substring(arrayStart, arrayEnd + 1);
  }
  return JSON.parse(clean);
}

const modelStandards = CACREP_STANDARDS.map((s) => ({
  code_2024: s.code_2024,
  code_legacy: s.code_legacy,
  description: s.description,
}));
const modelCourses = SIMCARE_COURSES.map((c) => ({
  courseName: c.courseName,
  avatars: c.avatars.map((a) => ({
    name: a.name,
    age: a.age,
    skill_focus: a.skill_focus,
    presenting_problem: a.presenting_problem,
  })),
}));

const standardByCode = new Map(CACREP_STANDARDS.map((s) => [s.code_2024, s]));
const avatarByNameCourse = new Map();
for (const c of SIMCARE_COURSES) {
  for (const a of c.avatars) {
    avatarByNameCourse.set(`${a.name}|${c.courseName}`, {
      avatar: a,
      course_url: c.courseUrl,
      course: c.courseName,
    });
  }
}

function rationaleAgreesWithDescription(rationale, description) {
  if (!rationale || !description) return true;
  const segments = rationale.split(/["“”]/);
  const quoted = segments
    .filter((_, i) => i % 2 === 1)
    .filter((s) => s.length >= 8)
    .map((s) => s.toLowerCase());
  if (quoted.length === 0) return true;
  const descLower = description.toLowerCase();
  return quoted.some((phrase) => {
    const words = phrase.match(/[a-z]{5,}/g) || [];
    if (words.length === 0) return true;
    const matched = words.filter((w) => descLower.includes(w)).length;
    const threshold = Math.max(2, Math.ceil(words.length * 0.5));
    return matched >= threshold;
  });
}

function enrichResults(results) {
  return results.map((obj) => ({
    objective: obj.objective,
    cacrep_matches: (obj.cacrep_matches || [])
      .map((c) => {
        const src = standardByCode.get(c.code_2024);
        if (!src) return null;
        if (!rationaleAgreesWithDescription(c.rationale, src.description)) {
          return null;
        }
        return {
          code_2024: src.code_2024,
          code_legacy: src.code_legacy,
          area: src.area,
          description: src.description,
          rationale: c.rationale || '',
        };
      })
      .filter(Boolean),
    simcare_matches: (obj.simcare_matches || [])
      .map((s) => {
        const src = avatarByNameCourse.get(`${s.avatar_name}|${s.course}`);
        if (!src) return null;
        const a = src.avatar;
        return {
          avatar_name: a.name,
          age: a.age,
          course: src.course,
          course_url: src.course_url,
          module: a.module,
          skill_focus: a.skill_focus,
          presenting_problem: a.presenting_problem,
          why_useful: s.why_useful || '',
        };
      })
      .filter(Boolean),
  }));
}

async function callGroq(apiKey, userMessage) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_tokens: 2800,
      temperature: 0,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });
}

export async function POST(request) {
  const keys = loadKeys();
  if (keys.length === 0) {
    return Response.json({ error: 'Server is not configured. GROQ_API_KEYS missing.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const syllabusText = (body?.syllabusText || '').trim();
  if (!syllabusText) {
    return Response.json({ error: 'syllabusText is required.' }, { status: 400 });
  }
  if (syllabusText.length > 80_000) {
    return Response.json({ error: 'Syllabus is too long. Please trim to under 80,000 characters.' }, { status: 413 });
  }

  const userMessage = `SYLLABUS:
${syllabusText}

CACREP STANDARDS (each has code_2024, code_legacy, description; pick by description text):
${JSON.stringify(modelStandards)}

SIMCARE AVATARS (each course has avatars with name, age, skill_focus, presenting_problem):
${JSON.stringify(modelCourses)}

Return the JSON array only.`;

  let groqRes = null;
  let usedKeyIndex = -1;
  let lastFailureStatus = 0;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (cursor + attempt) % keys.length;
    let res;
    try {
      res = await callGroq(keys[idx], userMessage);
    } catch (e) {
      lastFailureStatus = 0;
      continue;
    }
    if (res.status === 429 || res.status === 413) {
      lastFailureStatus = res.status;
      continue;
    }
    groqRes = res;
    usedKeyIndex = idx;
    cursor = idx;
    break;
  }

  if (!groqRes) {
    return Response.json(
      {
        error: 'All Groq API keys are rate-limited or unreachable right now. Please try again in a minute.',
        last_status: lastFailureStatus,
        keys_tried: keys.length,
      },
      { status: 429 }
    );
  }

  if (groqRes.status === 401) {
    return Response.json({ error: `Key #${usedKeyIndex + 1} is invalid. Please check server configuration.` }, { status: 500 });
  }
  if (!groqRes.ok) {
    const text = await groqRes.text();
    return Response.json({ error: `Upstream error (${groqRes.status}).`, detail: text.slice(0, 300) }, { status: 502 });
  }

  const data = await groqRes.json();
  const choice = data?.choices?.[0];
  const raw = choice?.message?.content || '';
  const finish = choice?.finish_reason;

  if (finish === 'length') {
    return Response.json(
      {
        error:
          'The model ran out of room while generating the mapping. This usually means the syllabus has more learning objectives than the response window can fit. Try pasting a smaller section, or run the upper and lower halves of the syllabus separately.',
      },
      { status: 200 }
    );
  }

  try {
    const parsed = cleanJsonResponse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const looksLike = looksLikeSyllabus(syllabusText);
      return Response.json(
        {
          error: looksLike
            ? 'No learning objectives were found in this syllabus. Try pasting the section that lists course goals, learning outcomes, or "by the end of this course, students will…" statements.'
            : 'This text does not look like a course syllabus. Paste a syllabus with learning objectives, ideally numbered or bulleted (for example, "1. Demonstrate active listening" / "2. Apply ACA Code of Ethics").',
        },
        { status: 200 }
      );
    }
    const results = enrichResults(parsed);
    return Response.json({
      results,
      usage: data.usage,
      _meta: { key_index: usedKeyIndex, keys_available: keys.length },
    });
  } catch (e) {
    return Response.json({ error: 'Could not parse model response.', raw: raw.slice(0, 2000) }, { status: 502 });
  }
}
