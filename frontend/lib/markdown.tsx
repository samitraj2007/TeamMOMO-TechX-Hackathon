import type { ReactNode } from "react";
import { RecordChip } from "@/components/records/Records";

const CITE = /\[((?:[A-Z]{2,4}-\d{3,6})(?:\s*,\s*[A-Z]{2,4}-\d{3,6})*)\]/g;

/** Inline subset the SAR template uses: citations, code, emphasis, strike, escaped specials. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\\([\\`*_\[\]|<>#])|`([^`]+)`|~~([^~]+)~~|\*([^*]+)\*|\[((?:[A-Z]{2,4}-\d{3,6})(?:\s*,\s*[A-Z]{2,4}-\d{3,6})*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(m[1]);
    else if (m[2]) out.push(<code key={k} className="num rounded-xs border border-hairline bg-raised px-1 text-xs text-text">{m[2]}</code>);
    else if (m[3]) out.push(<s key={k} className="text-muted">{m[3]}</s>);
    else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
    else if (m[5]) out.push(<Cites key={k} ids={m[5]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Cites({ ids }: { ids: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {ids.split(/\s*,\s*/).map((id) => (
        <RecordChip key={id} id={id} />
      ))}
    </span>
  );
}

/** Renders the report template's markdown subset. Anything else is shown as text, never executed. */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const key = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].slice(1, lines[i].endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={key()} className="overflow-x-auto rounded-panel border border-hairline">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-hairline/70 last:border-b-0">
                  {r.map((c, ci) => {
                    const Cell = ri === 0 ? "th" : "td";
                    return (
                      <Cell key={ci} className={`px-3 py-1.5 text-start ${ri === 0 ? "text-xs font-medium text-muted" : "text-text"}`}>
                        {inline(c, `${ri}-${ci}`)}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={key()} className="num overflow-x-auto rounded-panel border border-hairline bg-bg p-3 text-xs text-text">{buf.join("\n")}</pre>);
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(<h2 key={key()} className="text-lg font-medium text-text">{inline(line.slice(2), key())}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(<h3 key={key()} className="pt-3 text-sm font-semibold text-text">{inline(line.slice(3), key())}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      blocks.push(
        <blockquote key={key()} className="rounded-panel border border-model/40 bg-model/10 px-3 py-2 text-sm text-text">
          {inline(buf.join(" "), key())}
        </blockquote>,
      );
      continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ""));
      blocks.push(
        <ul key={key()} className="flex flex-col gap-1 ps-4 text-sm text-text">
          {items.map((item, ii) => (
            <li key={ii} className="list-disc">{inline(item, `${key()}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|## |> |\||```)|\s*[-*] /.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key()} className="text-sm leading-6 text-text">{inline(buf.join(" "), key())}</p>);
  }
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export function citationIds(text: string): string[] {
  return [...text.matchAll(CITE)].flatMap((m) => m[1].split(/\s*,\s*/));
}
