// Minimal, safe Markdown renderer for agent profiles (no raw HTML is ever injected).
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

function inline(text, key = 0) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<strong key={`${key}-${m.index}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) parts.push(<code key={`${key}-${m.index}`}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (href.startsWith('/')) parts.push(<Link key={`${key}-${m.index}`} to={href}>{label}</Link>);
      else if (/^https?:\/\//.test(href)) parts.push(<a key={`${key}-${m.index}`} href={href} target="_blank" rel="noopener noreferrer">{label}</a>);
      else parts.push(label);
    }
    else parts.push(<em key={`${key}-${m.index}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ source }) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(<pre key={i}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const Tag = `h${Math.min(Math.max(h[1].length, 2), 5)}`;
      out.push(<Tag key={i}>{inline(h[2], i)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(<List key={i}>{items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</List>);
      continue;
    }
    if (line.startsWith('>')) {
      out.push(<blockquote key={i}>{inline(line.replace(/^>\s?/, ''), i)}</blockquote>);
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim()) || !line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) para.push(lines[i++]);
    if (para.length) out.push(<p key={i}>{inline(para.join(' '), i)}</p>);
    else i++;
  }
  return <div className="markdown">{out.map((n, k) => <Fragment key={k}>{n}</Fragment>)}</div>;
}
