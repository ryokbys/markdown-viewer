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

export async function renderMarkdown(markdown: string): Promise<string> {
  const rendered = await processor.process(markdown);
  return String(rendered);
}
