import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { FaFileAlt, FaFilePdf, FaFolderOpen, FaPalette, FaTextHeight } from "react-icons/fa";
import "katex/dist/katex.min.css";
import "./App.css";
import { renderMarkdown } from "./lib/markdown";
import type {
  DocumentPayload,
  LocalLinkResolution,
  MarkdownChangedEvent,
  ThemeOption,
  ThemesChangedEvent,
  ViewerSettings,
} from "./lib/types";

const FONT_SIZE_PRESETS = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
const TEXT_WIDTH_PERCENT_PRESETS = [60, 70, 80, 90];
const DEFAULT_WINDOW_WIDTH = 1100;
const DEFAULT_SETTINGS: ViewerSettings = {
  fontSize: 16,
  textWidthPercent: 70,
  theme: "default",
};
const DEFAULT_THEME_OPTION: ThemeOption = { id: "default", name: "GitHub Light" };

function getWindowWidth() {
  return typeof window === "undefined" ? DEFAULT_WINDOW_WIDTH : window.innerWidth;
}

function ensurePdfExtension(path: string) {
  return path.toLowerCase().endsWith(".pdf") ? path : `${path}.pdf`;
}

function App() {
  const [document, setDocument] = useState<DocumentPayload | null>(null);
  const [html, setHtml] = useState("");
  const [themeCss, setThemeCss] = useState("");
  const [themeOptions, setThemeOptions] = useState<ThemeOption[]>([DEFAULT_THEME_OPTION]);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [watcherNotice, setWatcherNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => getWindowWidth());
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pdfExportContentRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const themeCssCache = useRef<Map<string, string>>(new Map([["default", ""]]));

  const activeThemeOptions = useMemo(
    () => [DEFAULT_THEME_OPTION, ...themeOptions.filter((option) => option.id !== "default")],
    [themeOptions],
  );

  const computedTextWidth = useMemo(
    () => Math.round((windowWidth * settings.textWidthPercent) / 100),
    [settings.textWidthPercent, windowWidth],
  );

  const persistSettings = useCallback(async (next: ViewerSettings) => {
    await invoke("save_settings", { settings: next });
  }, []);

  const snapshotScrollRatio = useCallback(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }
    const maxScroll = node.scrollHeight - node.clientHeight;
    pendingScrollRatioRef.current = maxScroll > 0 ? node.scrollTop / maxScroll : 0;
  }, []);

  const restoreScrollRatio = useCallback(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }
    const ratio = pendingScrollRatioRef.current;
    if (ratio == null) {
      return;
    }
    const maxScroll = node.scrollHeight - node.clientHeight;
    node.scrollTop = maxScroll > 0 ? ratio * maxScroll : 0;
    pendingScrollRatioRef.current = null;
  }, []);

  const loadThemeOptions = useCallback(async () => {
    const options = await invoke<ThemeOption[]>("list_user_themes");
    setThemeOptions(options);
  }, []);

  const applyTheme = useCallback(
    async (themeId: string, options = { silentFallback: false }) => {
      if (themeId === "default") {
        setThemeCss("");
        themeCssCache.current.set("default", "");
        if (settings.theme !== "default") {
          const next = { ...settings, theme: "default" };
          setSettings(next);
          await persistSettings(next);
        }
        return;
      }

      if (themeCssCache.current.has(themeId)) {
        setThemeCss(themeCssCache.current.get(themeId) ?? "");
        return;
      }

      try {
        const css = await invoke<string>("read_theme_css", { themeId });
        themeCssCache.current.set(themeId, css);
        setThemeCss(css);
      } catch {
        setThemeCss("");
        themeCssCache.current.delete(themeId);
        const next = { ...settings, theme: "default" };
        setSettings(next);
        await persistSettings(next);
        if (!options.silentFallback) {
          setErrorMessage("Failed to load theme. Reverted to the default theme.");
        }
      }
    },
    [persistSettings, settings],
  );

  const loadDocument = useCallback(
    async (path: string, options?: { anchor?: string | null; preserveScroll?: boolean }) => {
      setIsBusy(true);
      setErrorMessage(null);
      setWatcherNotice(null);
      if (options?.preserveScroll) {
        snapshotScrollRatio();
      } else {
        pendingScrollRatioRef.current = null;
      }
      pendingAnchorRef.current = options?.anchor ?? null;

      try {
        const loaded = await invoke<DocumentPayload>("open_markdown_document", { path });
        setDocument(loaded);
        await invoke("watch_markdown_document", { path: loaded.path });
      } catch (error) {
        pendingAnchorRef.current = null;
        pendingScrollRatioRef.current = null;
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setIsBusy(false);
      }
    },
    [snapshotScrollRatio],
  );

  const loadImageAssets = useCallback(async () => {
    if (!document || !contentRef.current) {
      return;
    }

    const images = Array.from(contentRef.current.querySelectorAll("img"));
    await Promise.all(
      images.map(async (image) => {
        const source = image.getAttribute("src");
        if (!source || source.startsWith("data:")) {
          return;
        }
        if (/^https?:\/\//i.test(source)) {
          image.replaceWith(Object.assign(globalThis.document.createElement("span"), {
            className: "blocked-image",
            textContent: `External images are not loaded: ${source}`,
          }));
          return;
        }

        try {
          const asset = await invoke<string>("load_image_asset", {
            documentPath: document.path,
            source,
          });
          image.setAttribute("src", asset);
        } catch {
          image.classList.add("broken-image");
          image.setAttribute("alt", `${image.getAttribute("alt") ?? "image"} (failed to load)`);
        }
      }),
    );
  }, [document]);

  const handleOpenDialog = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });

    if (typeof selected === "string") {
      await loadDocument(selected);
    }
  }, [loadDocument]);

  const handleExportPdf = useCallback(async () => {
    if (!document) {
      return;
    }

    const exportSource = contentRef.current?.querySelector<HTMLElement>(".markdown-content");
    const exportTarget = pdfExportContentRef.current;
    if (!exportSource || !exportTarget) {
      setErrorMessage("Failed to prepare PDF export.");
      return;
    }
    exportTarget.innerHTML = exportSource.innerHTML;

    const suggestedName = `${document.title.replace(/\.md$/i, "") || "document"}.pdf`;
    const selected = await save({
      defaultPath: suggestedName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (typeof selected !== "string") {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await invoke("export_current_pdf", { outputPath: ensurePdfExtension(selected) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }, [document]);

  const handleDropPaths = useCallback(
    async (paths: string[]) => {
      const firstMarkdown = paths.find((path) => path.toLowerCase().endsWith(".md"));
      if (!firstMarkdown) {
        setErrorMessage("Only `.md` files can be opened.");
        return;
      }
      await loadDocument(firstMarkdown);
    },
    [loadDocument],
  );

  const handleAnchorJump = useCallback((anchor: string) => {
    const node = contentRef.current;
    if (!node) {
      return;
    }
    const target = node.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
    target?.scrollIntoView({ block: "start" });
  }, []);

  const handleContentClick = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        return;
      }
      event.preventDefault();

      if (href.startsWith("#")) {
        handleAnchorJump(href.slice(1));
        return;
      }

      if (/^https?:\/\//i.test(href)) {
        await openUrl(href);
        return;
      }

      if (!document) {
        return;
      }

      try {
        const resolved = await invoke<LocalLinkResolution>("resolve_local_link", {
          documentPath: document.path,
          href,
        });
        if (resolved.kind === "markdown") {
          await loadDocument(resolved.path, { anchor: resolved.anchor, preserveScroll: false });
          return;
        }
        await openPath(resolved.path);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [document, handleAnchorJump, loadDocument],
  );

  useEffect(() => {
    void (async () => {
      const stored = await invoke<ViewerSettings>("load_settings");
      setSettings(stored);
      await loadThemeOptions();
      const launchPath = await invoke<string | null>("get_launch_markdown_path");
      if (launchPath) {
        await loadDocument(launchPath);
      }
    })().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  }, [loadDocument, loadThemeOptions]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(getWindowWidth());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (event.metaKey && event.key === "o") {
        event.preventDefault();
        void handleOpenDialog();
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === "-") {
          event.preventDefault();
          setSettings((prev) => {
            const idx = FONT_SIZE_PRESETS.indexOf(prev.fontSize);
            if (idx <= 0) return prev;
            const next = { ...prev, fontSize: FONT_SIZE_PRESETS[idx - 1] };
            void persistSettings(next);
            return next;
          });
          return;
        }
        if (event.key === "^") {
          event.preventDefault();
          setSettings((prev) => {
            const idx = FONT_SIZE_PRESETS.indexOf(prev.fontSize);
            if (idx < 0 || idx >= FONT_SIZE_PRESETS.length - 1) return prev;
            const next = { ...prev, fontSize: FONT_SIZE_PRESETS[idx + 1] };
            void persistSettings(next);
            return next;
          });
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenDialog, persistSettings]);


  useEffect(() => {
    void renderMarkdown(document?.markdown ?? "")
      .then((nextHtml) => {
        setHtml(nextHtml);
        setRenderError(null);
      })
      .catch((error) => {
        setHtml("");
        setRenderError(error instanceof Error ? error.message : String(error));
      });
  }, [document]);

  useEffect(() => {
    if (!document || !html) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadImageAssets().then(() => {
        if (pendingAnchorRef.current) {
          handleAnchorJump(pendingAnchorRef.current);
          pendingAnchorRef.current = null;
        } else {
          restoreScrollRatio();
        }
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [document, handleAnchorJump, html, loadImageAssets, restoreScrollRatio]);

  useEffect(() => {
    void applyTheme(settings.theme, { silentFallback: true });
  }, [applyTheme, settings.theme]);

  useEffect(() => {
    let unlistenDocument: (() => void) | undefined;
    let unlistenOpenRequested: (() => void) | undefined;
    let unlistenThemes: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;

    void (async () => {
      unlistenDocument = await listen<MarkdownChangedEvent>("document-updated", async (event) => {
        if (!document || event.payload.path !== document.path) {
          return;
        }
        setWatcherNotice(null);
        await loadDocument(document.path, { preserveScroll: true });
      });

      unlistenOpenRequested = await listen<MarkdownChangedEvent>(
        "document-open-requested",
        async (event) => {
          await loadDocument(event.payload.path);
        },
      );

      unlistenThemes = await listen<ThemesChangedEvent>("themes-updated", async () => {
        themeCssCache.current = new Map([["default", ""]]);
        await loadThemeOptions();
        if (settings.theme !== "default") {
          await applyTheme(settings.theme, { silentFallback: false });
        }
      });

      unlistenDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragging(true);
          return;
        }
        if (event.payload.type === "leave") {
          setIsDragging(false);
          return;
        }
        if (event.payload.type === "drop") {
          setIsDragging(false);
          await handleDropPaths(event.payload.paths);
        }
      });
    })();

    return () => {
      unlistenDocument?.();
      unlistenOpenRequested?.();
      unlistenThemes?.();
      unlistenDrop?.();
    };
  }, [applyTheme, document, handleDropPaths, loadDocument, loadThemeOptions, settings.theme]);


  const updateSetting = useCallback(
    async <K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) => {
      const next = { ...settings, [key]: value };
      setSettings(next);
      await persistSettings(next);
    },
    [persistSettings, settings],
  );

  return (
    <main className="app-shell">
      {themeCss && <style>{themeCss}</style>}

      <header className="toolbar">
        <div className="toolbar-group">
          <button className="primary-button" onClick={() => void handleOpenDialog()} type="button">
            <FaFolderOpen />
            <span>Open…</span>
          </button>
          <span className="document-title">{document?.title ?? "No document"}</span>
        </div>

        <div className="toolbar-group toolbar-controls">
          <label>
            <FaPalette />
            <select
              value={settings.theme}
              onChange={(event) => void updateSetting("theme", event.currentTarget.value)}
            >
              {activeThemeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <FaTextHeight />
            <select
              value={String(settings.fontSize)}
              onChange={(event) => void updateSetting("fontSize", Number(event.currentTarget.value))}
            >
              {FONT_SIZE_PRESETS.map((fontSize) => (
                <option key={fontSize} value={fontSize}>
                  {fontSize}px
                </option>
              ))}
            </select>
          </label>

          <label>
            <FaFileAlt />
            <select
              value={String(settings.textWidthPercent)}
              onChange={(event) =>
                void updateSetting("textWidthPercent", Number(event.currentTarget.value))
              }
            >
              {TEXT_WIDTH_PERCENT_PRESETS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
            <span>{computedTextWidth}px</span>
          </label>

          <button
            className="secondary-button"
            disabled={!document || isBusy}
            onClick={() => void handleExportPdf()}
            type="button"
          >
            <FaFilePdf />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      {(errorMessage || renderError || watcherNotice) && (
        <section className="message-stack">
          {errorMessage && <div className="message error">{errorMessage}</div>}
          {renderError && <div className="message error">Failed to render Markdown: {renderError}</div>}
          {watcherNotice && <div className="message notice">{watcherNotice}</div>}
        </section>
      )}

      <section className={`viewer-shell ${isDragging ? "dragging" : ""}`}>
        {!document ? (
          <div className="empty-state">
            <h1>Markdown Viewer</h1>
            <p>A view-only Markdown reader. No editing features.</p>
            <div className="empty-actions">
              <button className="primary-button" onClick={() => void handleOpenDialog()} type="button">
                Open…
              </button>
              <span>or drag &amp; drop from Finder</span>
            </div>
          </div>
        ) : (
          <div ref={contentRef} className="content-scroll">
            <article
              className="markdown-theme-root"
              style={{
                ["--viewer-font-size" as string]: `${settings.fontSize}px`,
                ["--viewer-text-width" as string]: `${computedTextWidth}px`,
              }}
            >
              <div
                className="markdown-body markdown-content"
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={(event) => void handleContentClick(event)}
              />
            </article>
          </div>
        )}
        {isBusy && <div className="busy-indicator">Working…</div>}
      </section>

      {document && (
        <section className="pdf-export-root" aria-hidden="true">
          <article
            className="markdown-theme-root"
            style={{
              ["--viewer-font-size" as string]: `${settings.fontSize}px`,
              ["--viewer-text-width" as string]: `${computedTextWidth}px`,
            }}
          >
            <div ref={pdfExportContentRef} className="markdown-body markdown-content" />
          </article>
        </section>
      )}
    </main>
  );
}

export default App;
