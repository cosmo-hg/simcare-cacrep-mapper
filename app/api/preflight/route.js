import { PREFLIGHT_PROMPT } from '@/lib/preflight-prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

let cursor = 0;

const ACTION_VERBS = /\b(demonstrate|apply|recognize|recognise|conduct|identify|articulate|develop|provide|integrate|examine|analyze|analyse|evaluate|design|implement|describe|explain|compare|differentiate|assess|construct|formulate|interpret|use|deliver|perform|practice|practise|engage|build|create|generate|propose|select|administer|coordinate)s?\b/gi;

function detectFormat(text) {
  const trimmed = text.trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();

  if (length < 30) {
    return {
      action: 'reject',
      message: 'This text is too short to map. Paste at least a few sentences of your course content — a learning objectives list, a weekly schedule, or a brief course description all work.',
    };
  }

  const actionVerbCount = (trimmed.match(ACTION_VERBS) || []).length;
  const numberedListCount = (trimmed.match(/^\s*\d+[\.\)]\s/gm) || []).length;
  const bulletCount = (trimmed.match(/^\s*[\-\*•]\s/gm) || []).length;
  const itemCount = numberedListCount + bulletCount;

  const hasObjectiveIntro = /(by the end of (this )?(course|module|unit|semester)|students? will be able to|course (learning )?(objectives?|outcomes?|goals?)|learning outcomes?|will demonstrate)/i.test(trimmed);

  const hasSchedulePattern = /\b(week|module|unit|lesson|day)\s*\d+/i.test(trimmed);

  if (hasObjectiveIntro && (itemCount >= 2 || actionVerbCount >= 3)) {
    return { action: 'map' };
  }
  if (actionVerbCount >= 4 && itemCount >= 3) {
    return { action: 'map' };
  }
  if (hasObjectiveIntro && actionVerbCount >= 4) {
    return { action: 'map' };
  }

  if (hasSchedulePattern) {
    return { action: 'normalize', hint: 'weekly_schedule' };
  }

  const courseLikeHints = ['course', 'syllabus', 'curriculum', 'topic', 'outcome', 'objective', 'goal', 'overview', 'description', 'unit', 'module'];
  const hintCount = courseLikeHints.filter((h) => lower.includes(h)).length;

  if (length < 600 && hintCount >= 1) {
    return { action: 'normalize', hint: 'brief_description' };
  }
  if (hintCount >= 2) {
    return { action: 'normalize', hint: 'topic_list' };
  }

  return {
    action: 'reject',
    message: "We couldn't recognize this as course content. Paste your Course Learning Objectives, a weekly topic list, or a brief course description — the part that describes what the course teaches.",
  };
}

async function callNormalizer(apiKey, syllabusText) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_tokens: 1500,
      temperature: 0,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: PREFLIGHT_PROMPT },
        { role: 'user', content: syllabusText },
      ],
    }),
  });
}

function cleanJsonArray(rawText) {
  let clean = (rawText || '').replace(/```json|```/g, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.substring(start, end + 1);
  }
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('not an array');
  return parsed.filter((s) => typeof s === 'string' && s.trim().length > 0);
}

export async function POST(request) {
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
    return Response.json({ error: 'Input is too long. Please trim to under 80,000 characters.' }, { status: 413 });
  }

  const detected = detectFormat(syllabusText);

  if (detected.action === 'reject') {
    return Response.json({ action: 'reject', message: detected.message }, { status: 200 });
  }

  if (detected.action === 'map') {
    return Response.json({ action: 'map' }, { status: 200 });
  }

  const keys = loadKeys();
  if (keys.length === 0) {
    return Response.json({ error: 'Server is not configured. GROQ_API_KEYS missing.' }, { status: 500 });
  }

  let groqRes = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (cursor + attempt) % keys.length;
    let res;
    try {
      res = await callNormalizer(keys[idx], syllabusText);
    } catch {
      continue;
    }
    if (res.status === 429 || res.status === 413) continue;
    groqRes = res;
    cursor = idx;
    break;
  }
  if (!groqRes || !groqRes.ok) {
    return Response.json(
      { error: 'Could not analyse the input right now. Try again in a moment.' },
      { status: 429 }
    );
  }

  const data = await groqRes.json();
  const raw = data?.choices?.[0]?.message?.content || '';

  let objectives;
  try {
    objectives = cleanJsonArray(raw);
  } catch {
    return Response.json(
      { error: 'Could not parse the analysed input. Please paste your Course Learning Objectives directly.' },
      { status: 200 }
    );
  }

  if (objectives.length === 0) {
    return Response.json(
      {
        action: 'reject',
        message: "We couldn't extract objectives from this text. Try pasting the Course Learning Objectives section directly.",
      },
      { status: 200 }
    );
  }

  return Response.json({
    action: 'review',
    objectives,
    hint: detected.hint,
  });
}
