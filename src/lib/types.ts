export type ViewerSettings = {
  fontSize: number;
  textWidth: number;
  theme: string;
};

export type ThemeOption = {
  id: string;
  name: string;
};

export type DocumentPayload = {
  path: string;
  title: string;
  markdown: string;
};

export type LocalLinkResolution = {
  kind: "markdown" | "file";
  path: string;
  anchor: string | null;
};

export type MarkdownChangedEvent = {
  path: string;
};

export type ThemesChangedEvent = {
  directory: string;
};
