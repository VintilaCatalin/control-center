import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// Core build + a curated language set, not the full ~190-language
// bundle - keeps this from dragging in a VS-Code-sized dependency for a
// notes app. Covers what a personal vault actually fences in practice;
// anything else just renders as plain (still correct, never mis-tagged).
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

// Only highlight when the fence names a language we actually registered
// - no highlightAuto guessing, which reads as noisy/wrong more often
// than it helps in a small personal vault. Unrecognised/unfenced code
// just renders as plain monospace, never mis-coloured.
export function highlightCode(text: string, lang?: string): { html: string; language: string } | null {
  if (!lang) return null;
  const name = lang.toLowerCase().trim();
  if (!hljs.getLanguage(name)) return null;
  try {
    return { html: hljs.highlight(text, { language: name }).value, language: name };
  } catch {
    return null;
  }
}
