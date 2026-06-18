'use client';

import { useState, useMemo, useRef } from 'react';
import { SAMPLE_SYLLABUS } from '@/lib/sample-syllabus';

const AREA_COLORS = {
  '3.A': '#a14e2b',
  '3.B': '#5b3a8a',
  '3.C': '#2f6b4d',
  '3.D': '#8a6b1d',
  '3.E': '#1f4d7a',
  '3.F': '#1f6b6b',
  '3.G': '#883333',
  '3.H': '#4a4a40',
};
const chipColor = (code) => AREA_COLORS[(code || '').split('.').slice(0, 2).join('.')] || '#4a4a40';

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [rawFallback, setRawFallback] = useState('');
  const resultsRef = useRef(null);

  const [reviewing, setReviewing] = useState(null);

  const activeText = pasted;
  const canSubmit = activeText.trim().length > 0 && !loading && !reviewing;

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setRawFallback('');
    setReviewing(null);
    try {
      const res = await fetch('/api/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabusText: activeText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status}).`);
        return;
      }
      if (data.action === 'reject') {
        setError(data.message);
        return;
      }
      if (data.action === 'review') {
        setReviewing({ objectives: data.objectives, hint: data.hint });
        return;
      }
      await runMapping(activeText);
    } catch (e) {
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  const runMapping = async (text) => {
    const res = await fetch('/api/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syllabusText: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || `Request failed (${res.status}).`);
      if (data?.raw) setRawFallback(data.raw);
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }
    setResults(data.results);
    setReviewing(null);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const confirmReview = async () => {
    if (!reviewing) return;
    const cleaned = reviewing.objectives.map((o) => o.trim()).filter((o) => o.length > 0);
    if (cleaned.length === 0) {
      setError('Please write at least one objective before mapping.');
      return;
    }
    const constructed =
      'Course Learning Objectives. By the end of this course, students will be able to:\n\n' +
      cleaned.map((o, i) => `${i + 1}. ${o}`).join('\n\n');
    setLoading(true);
    setError(null);
    try {
      await runMapping(constructed);
    } catch (e) {
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateReviewObjective = (i, value) => {
    setReviewing((r) => ({ ...r, objectives: r.objectives.map((o, idx) => (idx === i ? value : o)) }));
  };
  const removeReviewObjective = (i) => {
    setReviewing((r) => ({ ...r, objectives: r.objectives.filter((_, idx) => idx !== i) }));
  };
  const addReviewObjective = () => {
    setReviewing((r) => ({ ...r, objectives: [...r.objectives, ''] }));
  };
  const discardReview = () => {
    setReviewing(null);
    setError(null);
  };

  const exportCsv = () => {
    if (!results) return;
    const headers = ['Objective', 'CACREP 2024 Code', 'CACREP Legacy Code', 'CACREP Area', 'CACREP Description',
      'Avatar', 'Course', 'Module', 'Skill Focus', 'Presenting Problem', 'Why Useful'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [headers.join(',')];
    results.forEach((o) => {
      const cs = o.cacrep_matches?.length ? o.cacrep_matches : [{}];
      const ss = o.simcare_matches?.length ? o.simcare_matches : [{}];
      cs.forEach((c) => ss.forEach((s) => rows.push([
        esc(o.objective), esc(c.code_2024), esc(c.code_legacy), esc(c.area), esc(c.description),
        esc(s.avatar_name), esc(s.course), esc(s.module), esc(s.skill_focus), esc(s.presenting_problem), esc(s.why_useful),
      ].join(','))));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'simcare-cacrep-map.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    if (!results) return null;
    const codes = new Set(), avs = new Set();
    results.forEach((o) => {
      (o.cacrep_matches || []).forEach((c) => c.code_2024 && codes.add(c.code_2024));
      (o.simcare_matches || []).forEach((s) => s.avatar_name && avs.add(`${s.avatar_name}|${s.course}`));
    });
    return { objs: results.length, codes: codes.size, avs: avs.size };
  }, [results]);

  return (
    <main>
      <section className="mesh">
        <div className="max-w-[1180px] mx-auto px-6 pt-24 pb-20">
          <h1 className="font-serif text-[clamp(2.5rem,5vw,4.25rem)] leading-[1.05] tracking-tight text-ink-800 max-w-3xl">
            Map your counseling syllabus to CACREP 2024 standards.
          </h1>
          <p className="mt-6 text-lg text-ink-500 max-w-2xl leading-relaxed">
            See which standards your course covers and which named SimCare avatars give your students authentic practice on each objective.
          </p>
        </div>
      </section>

      <section className="max-w-[1180px] mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-card border border-ink-200/60 overflow-hidden">
          <div className="p-6 sm:p-8">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={`Example\nBy the end of this course, students will be able to:\n1. Demonstrate active listening and empathy in simulated counseling sessions\n2. Apply CBT Socratic questioning to client cognitive distortions\n3. Apply ACA Code of Ethics to confidentiality dilemmas\n4. Conduct basic suicide risk assessments`}
              className="w-full text-[15px] leading-relaxed text-ink-800 bg-transparent placeholder:text-ink-300 resize-y focus:outline-none"
              style={{ minHeight: 240 }}
            />
          </div>

          <div className="px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-[15px] font-medium tracking-tight transition-all duration-300 silk ${
                canSubmit
                  ? 'bg-ink-800 text-ink-50 hover:bg-ink-700 hover:-translate-y-0.5 hover:shadow-lift'
                  : 'bg-ink-200 text-ink-400 cursor-not-allowed'
              }`}
            >
              {loading && <span className="spinner" />} {loading ? 'Mapping your syllabus' : 'Generate CACREP map'}
            </button>
            <button
              onClick={() => setPasted(SAMPLE_SYLLABUS)}
              className="rounded-lg px-5 py-3.5 text-[14px] font-medium text-ink-700 border border-ink-300 hover:bg-ink-50 transition-colors duration-300"
            >
              Use sample syllabus
            </button>
          </div>
        </div>

        {reviewing && (
          <div className="mt-6 bg-white rounded-2xl shadow-card border border-ink-200/60 p-6 sm:p-8">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 mb-3">
              {reviewing.hint === 'weekly_schedule'
                ? 'Inferred from your weekly schedule'
                : reviewing.hint === 'topic_list'
                ? 'Inferred from your topic list'
                : 'Inferred from your input'}
            </div>
            <p className="text-[15px] text-ink-700 mb-6 leading-relaxed max-w-2xl">
              Your input wasn't in objective form. The objectives below were drafted from what you pasted. Edit any of them — rewrite, remove, or add new ones — then continue to mapping.
            </p>

            <div className="space-y-4">
              {reviewing.objectives.map((obj, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="font-serif text-[28px] text-ink-300 leading-none pt-1 tabular-nums shrink-0 w-10">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <textarea
                    value={obj}
                    onChange={(e) => updateReviewObjective(i, e.target.value)}
                    className="flex-1 text-[15px] leading-relaxed text-ink-800 bg-transparent placeholder:text-ink-300 resize-none focus:outline-none border-b border-ink-200 pb-2"
                    rows={2}
                  />
                  <button
                    onClick={() => removeReviewObjective(i)}
                    className="shrink-0 mt-1 px-2 py-1 text-ink-400 hover:text-[#883e1e] text-xl font-light leading-none"
                    aria-label="Remove objective"
                    title="Remove this objective"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addReviewObjective}
              className="mt-5 text-[13px] text-ink-500 hover:text-ink-800 transition-colors"
            >
              + Add another objective
            </button>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmReview}
                disabled={loading}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-[15px] font-medium tracking-tight transition-all duration-300 silk ${
                  loading
                    ? 'bg-ink-200 text-ink-400 cursor-not-allowed'
                    : 'bg-ink-800 text-ink-50 hover:bg-ink-700 hover:-translate-y-0.5 hover:shadow-lift'
                }`}
              >
                {loading && <span className="spinner" />} {loading ? 'Mapping these objectives' : 'Map these objectives'}
              </button>
              <button
                onClick={discardReview}
                disabled={loading}
                className="rounded-lg px-5 py-3.5 text-[14px] font-medium text-ink-700 border border-ink-300 hover:bg-ink-50 transition-colors duration-300 disabled:opacity-50"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-[#fbf3ef] border border-[#e2c2b1] text-[13px] text-[#883e1e]">
            {error}
          </div>
        )}
        {rawFallback && (
          <pre className="mt-3 p-4 rounded-lg bg-ink-800 text-ink-100 text-[12px] overflow-x-auto whitespace-pre-wrap max-h-72">
            {rawFallback}
          </pre>
        )}
      </section>

      {results && summary && (
        <section ref={resultsRef} className="max-w-[1180px] mx-auto px-6 pt-20 pb-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 mb-3">Mapping results</div>
              <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-ink-800">
                {summary.objs} learning objectives · {summary.codes} standards · {summary.avs} avatars
              </h2>
            </div>
            <button
              onClick={exportCsv}
              className="self-start sm:self-auto rounded-lg px-4 py-2.5 text-[13px] font-medium text-ink-700 border border-ink-300 hover:bg-ink-50 transition-colors duration-300"
            >
              Export as CSV
            </button>
          </div>

          <div className="space-y-6">
            {results.map((obj, i) => (
              <article key={i} className="tilt bg-white rounded-2xl border border-ink-200/60 shadow-card p-7 sm:p-9">
                <div className="flex items-baseline gap-4 mb-7">
                  <div className="font-serif text-3xl text-ink-300 leading-none">{String(i + 1).padStart(2, '0')}</div>
                  <h3 className="text-[17px] sm:text-[19px] font-medium text-ink-800 leading-snug tracking-tight">{obj.objective}</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 mb-4 pb-3 border-b border-ink-200/70">
                      CACREP 2024 standards
                    </div>
                    {(obj.cacrep_matches || []).length === 0 ? (
                      <div className="text-sm text-ink-400 italic">No direct CACREP match found.</div>
                    ) : (
                      <div className="space-y-5">
                        {obj.cacrep_matches.map((c, k) => (
                          <div key={k}>
                            <div className="flex items-center gap-3">
                              <span
                                className="inline-block px-2.5 py-1 rounded-md text-[12px] font-semibold text-white tracking-wide tabular-nums"
                                style={{ backgroundColor: chipColor(c.code_2024) }}
                              >
                                {c.code_2024}
                              </span>
                              {c.code_legacy && (
                                <span className="text-[11px] text-ink-400 tabular-nums">also: {c.code_legacy}</span>
                              )}
                            </div>
                            <div className="mt-2 text-[12px] uppercase tracking-[0.14em] text-ink-500">{c.area}</div>
                            <div className="mt-2 text-[14.5px] text-ink-700 leading-relaxed">{c.description}</div>
                            {c.rationale && (
                              <div className="mt-2 text-[13.5px] text-ink-500 italic leading-relaxed">{c.rationale}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 mb-4 pb-3 border-b border-ink-200/70">
                      SimCare avatars
                    </div>
                    {(obj.simcare_matches || []).length === 0 ? (
                      <div className="text-sm text-ink-400 italic">No direct SimCare match found.</div>
                    ) : (
                      <div className="space-y-5">
                        {obj.simcare_matches.map((s, k) => (
                          <div key={k}>
                            <div className="text-[15px] font-semibold text-ink-800 tracking-tight">
                              {s.avatar_name}{s.age ? <span className="text-ink-400 font-normal">, {s.age}</span> : null}
                            </div>
                            {s.course_url ? (
                              <a href={s.course_url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] text-accent hover:underline">
                                {s.course}
                              </a>
                            ) : (
                              <div className="text-[13.5px] text-ink-600">{s.course}</div>
                            )}
                            <div className="mt-1 text-[12px] text-ink-500 tabular-nums">{s.module} · {s.skill_focus}</div>
                            {s.presenting_problem && (
                              <div className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">{s.presenting_problem}</div>
                            )}
                            {s.why_useful && (
                              <div className="mt-2 text-[13.5px] text-ink-700 italic leading-relaxed">{s.why_useful}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-ink-200/60 bg-accent-soft/40 p-10 text-center">
            <div className="font-serif text-2xl sm:text-3xl text-ink-800 tracking-tight mb-7">
              Questions or feedback on this tool?
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="mailto:spam.mail.harsh.gupta@gmail.com?subject=SimCare%20CACREP%20Alignment%20Mapper"
                className="rounded-lg px-6 py-3 text-[14px] font-medium text-ink-50 bg-ink-800 hover:bg-ink-700 transition-colors duration-300"
              >
                Get in touch
              </a>
              <a
                href="https://catalog.simcare.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-6 py-3 text-[14px] font-medium text-ink-700 border border-ink-300 hover:bg-white transition-colors duration-300"
              >
                Browse the SimCare catalog
              </a>
            </div>
          </div>
        </section>
      )}

      <footer className="max-w-[1180px] mx-auto px-6 pt-10 pb-16 text-[12px] text-ink-400 leading-relaxed text-center">
        SimCare avatar data from <a href="https://catalog.simcare.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-600">catalog.simcare.ai</a> · CACREP 2024 standards from <a href="https://cacrep.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-600">cacrep.org</a> · Independent project, not affiliated with SimCare AI.
      </footer>
    </main>
  );
}
