import { parse as parseYAML } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "input",
    "section",
    "div",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "figure",
    "figcaption",
    "details",
    "summary",
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    a: [...(defaultSchema.attributes?.a ?? []), "href", "title", "target", "rel"],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/, "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^.*/], ["data-language", /^.*/], ["data-theme", /^.*/]],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "width", "height"],
    input: ["type", "checked", "disabled"],
    pre: [...(defaultSchema.attributes?.pre ?? []), ["className", /^.*/]],
    section: [["className", /^.*/]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^.*/], ["style", /^.*/]],
    table: [["className", /^.*/]],
    th: [["align", /^(left|right|center)$/]],
    td: [["align", /^(left|right|center)$/]],
    '*': [...(defaultSchema.attributes?.['*'] ?? []), ["className", /^.*/], "id"],
  },
} as typeof defaultSchema;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeKatex)
  .use(rehypeSlug)
  .use(rehypePrettyCode, {
    theme: "github-light",
    keepBackground: false,
    defaultLang: "text",
  })
  .use(rehypeStringify);

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function extractFrontmatter(markdown: string): { yaml: string | null; body: string } {
  const m = FRONTMATTER_RE.exec(markdown);
  if (!m) return { yaml: null, body: markdown };
  return { yaml: m[1], body: markdown.slice(m[0].length) };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function frontmatterToTable(yamlStr: string): string {
  let data: unknown;
  try {
    data = parseYAML(yamlStr);
  } catch {
    return "";
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return "";
  const rows = entries.map(([k, v]) => {
    const safeKey = k.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const safeVal = formatValue(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${safeKey} | ${safeVal} |`;
  });
  return `| Property | Value |\n| --- | --- |\n${rows.join("\n")}`;
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const { yaml, body } = extractFrontmatter(markdown);
  const table = yaml ? frontmatterToTable(yaml) : "";
  const source = table ? `${table}\n\n${body}` : body;
  const rendered = await processor.process(source);
  return String(rendered);
}
