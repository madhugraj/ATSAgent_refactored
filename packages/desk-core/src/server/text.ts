/**
 * The desk's pure text helpers (map §4 L2 desk-core): the message-body clip
 * and the agent-text cleanups behind `plainPreview`, extracted verbatim from
 * desk.server.ts with the conversation store. Pure string work only — no
 * database, no imports.
 */

/** Cut long text at a paragraph (never mid-sentence) and say where the rest is. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const at = text.lastIndexOf("\n\n", max - 80);
  const cut = at > max / 2 ? at : text.lastIndexOf(". ", max - 80) + 1 || max - 80;
  return `${text.slice(0, cut).trimEnd()}\n\n… The full text is in Agent activity.`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Agent text shown to people: drop "… ID: <uuid>" lines and any stray internal ids. */
export function readableAgentText(text: string): string {
  // Links are kept whole — an id inside a URL (/apply/<id>) is the link itself.
  const links: string[] = [];
  const shielded = text.replace(/https?:\/\/[^\s<>()`'"]+/g, (url) => {
    links.push(url);
    return `\uE000${links.length - 1}\uE000`;
  });
  return humanizeInternals(stripIds(shielded)).replace(
    /\uE000(\d+)\uE000/g,
    (_, i) => links[Number(i)]!,
  );
}

/**
 * Internal names an agent may echo: tool names (list_departments) become
 * words, "finalComplete: true"-style flags go. Code spans and links are kept.
 */
export function humanizeInternals(text: string): string {
  return text
    .split(/(```[\s\S]*?```)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            // "(finalComplete: true)", "; isFinal=false"
            .replace(/\s*\(\s*[a-z]+[A-Z]\w*\s*[:=]\s*(?:true|false)\s*\)/g, "")
            .replace(/(?:[;,]\s*)?\b[a-z]+[A-Z]\w*\s*[:=]\s*(?:true|false)\b/g, "")
            // `list_departments` / list_departments → "list departments" (not emails or file names)
            .replace(/`?(?<![\w@.])([a-z]+(?:_[a-z]+)+)(?![\w@]|\.\w)`?/g, (_m, w: string) =>
              w.replace(/_/g, " "),
            )
            // What a removed flag leaves behind: "(``)", "``".
            .replace(/\s*\(\s*`\s*`\s*\)/g, "")
            .replace(/`\s*`/g, "")
            .replace(/\(\s*\)/g, ""),
    )
    .join("");
}

/**
 * One-paragraph preview of agent text for lists (Agent activity): ids and
 * internal names out, markdown marks removed, cut at a word (pure; tested).
 */
export function plainPreview(text: string | null, max: number): string | null {
  if (!text) return text;
  const plain = readableAgentText(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.lastIndexOf(" ", max);
  return `${plain.slice(0, cut > max / 2 ? cut : max)}…`;
}

const ENTITY = "Application|Candidate|Requisition|Offer|Run|Task|Assessment|Interview";

function stripIds(text: string): string {
  const id = `\`?${UUID.source}\`?`;
  const hadId = new RegExp(UUID.source, "i");
  // A line that was "Application ID: <id>" in any markdown dress, now empty.
  const emptyLabel = /^[\s>*_\-•#]*[A-Za-z][\w ./&-]{0,40}[*_]*\s*[:=]?\s*[*_`]*\s*$/;
  return (
    text
      .split("\n")
      .map((line) => {
        if (!hadId.test(line)) return line;
        const left = line.replace(new RegExp(`\\s*${id}`, "gi"), "");
        return /[:=]/.test(line) && emptyLabel.test(left) ? null : line;
      })
      .filter((line): line is string => line !== null)
      // "Application ID:" left empty when an earlier pass removed its id.
      .filter((line) => !/^[\s>*_\-•]*[A-Za-z ]{0,30}\bID\b[*_]*\s*[:=]?\s*[*_`]*\s*$/.test(line))
      // A line that is only "<label> id: <id>" says nothing to a person.
      .filter(
        (line) => !new RegExp(`^[\\s*\\-•]*[\\w ]{0,30}:?\\s*${id}[\\s.,)]*$`, "i").test(line),
      )
      .join("\n")
      // "Application ID: <id>", "(ID: <id>)", "Requisition: <id>": the label goes with the id.
      .replace(new RegExp(`,?\\s*\\b[A-Za-z]+(?:\\s(?:ID|Id|id))?\\s*[:=]\\s*${id}`, "g"), "")
      .replace(new RegExp(`\\s*${id}`, "gi"), "")
      // …and what an earlier pass left of it: "(Application, Requisition)".
      .replace(new RegExp(`\\s*\\((?:\\s*(?:${ENTITY})(?:\\s+ID)?\\s*,?)+\\s*\\)`, "gi"), "")
      // "(<id>)" leaves "()" behind; "(<id>, x)" leaves "(, x)".
      .replace(/\s*\(\s*\)/g, "")
      .replace(/\(\s*,\s*/g, "(")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
