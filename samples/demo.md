# Markdown Viewer Demo

This document is a sample for manual verification.

- GFM
- Math
- Syntax highlighting
- Relative links
- Relative images
- Raw HTML sanitization

## Links (in place of a table of contents)

- [Jump to Math section](#math-section)
- [Jump to Code section](#code-section)
- [Open another page](linked.md)

## Table and task list

| Item | Value |
| --- | --- |
| theme | GitHub Light |
| font size | 16px |
| text width | 70% |

- [x] GFM table
- [x] task list
- [x] relative image
- [ ] external image is blocked by design

## Blockquote

> Markdown Viewer is view-only.
> Intended to be used alongside an external editor.

## Math section

Inline math: $e^{i\pi} + 1 = 0$

Block math:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## Code section

```ts
const settings = {
  fontSize: 16,
  textWidthPercent: 70,
  theme: "default",
};

console.log(settings);
```

## Relative image

![Local SVG image](assets/sample-diagram.svg)

## Raw HTML

<div class="custom-html-block">
  <strong>HTML block</strong> is rendered.
</div>

<script>
  console.log('this should not execute');
</script>

## External links

- [Tauri](https://tauri.app/)
- [React](https://react.dev/)
