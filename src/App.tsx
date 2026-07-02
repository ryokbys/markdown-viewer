import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { FaFileAlt, FaFolderOpen, FaPalette, FaTextHeight } from "react-icons/fa";
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

const FONT_SIZE_PRESETS = [14, 16, 18, 20];
const TEXT_WIDTH_PRESETS = [680, 760, 860];
const DEFAULT_SETTINGS: ViewerSettings = {
  fontSize: 16,
  textWidth: 760,
  theme: "default",
};
const DEFAULT_THEME_OPTION: ThemeOption = { id: "default", name: "GitHub Light" };

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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const pendingScrollRatioRef = useRef<number | null>(null);
  const themeCssCache = useRef<Map<string, string>>(new Map([["default", ""]]));

  const activeThemeOptions = useMemo(
    () => [DEFAULT_THEME_OPTION, ...themeOptions.filter((option) => option.id !== "default")],
    [themeOptions],
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
          setErrorMessage("テーマを読み込めなかったため、既定テーマに戻しました。");
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
            textContent: `外部画像は読み込みません: ${source}`,
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
          image.setAttribute("alt", `${image.getAttribute("alt") ?? "image"} (読み込めません)`);
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

  const handleDropPaths = useCallback(
    async (paths: string[]) => {
      const firstMarkdown = paths.find((path) => path.toLowerCase().endsWith(".md"));
      if (!firstMarkdown) {
        setErrorMessage("`.md` ファイルだけ開けます。");
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
              value={String(settings.textWidth)}
              onChange={(event) => void updateSetting("textWidth", Number(event.currentTarget.value))}
            >
              {TEXT_WIDTH_PRESETS.map((width) => (
                <option key={width} value={width}>
                  {width}px
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {(errorMessage || renderError || watcherNotice) && (
        <section className="message-stack">
          {errorMessage && <div className="message error">{errorMessage}</div>}
          {renderError && <div className="message error">Markdown の描画に失敗しました: {renderError}</div>}
          {watcherNotice && <div className="message notice">{watcherNotice}</div>}
        </section>
      )}

      <section className={`viewer-shell ${isDragging ? "dragging" : ""}`}>
        {!document ? (
          <div className="empty-state">
            <h1>Markdown Viewer</h1>
            <p>ローカルの `.md` を表示します。編集機能はありません。</p>
            <div className="empty-actions">
              <button className="primary-button" onClick={() => void handleOpenDialog()} type="button">
                Open…
              </button>
              <span>または Finder からドラッグ&ドロップ</span>
            </div>
          </div>
        ) : (
          <>
            {themeCss && <style>{themeCss}</style>}
            <div
              ref={contentRef}
              className="content-scroll"
              style={{ ["--viewer-font-size" as string]: `${settings.fontSize}px` }}
            >
              <article
                className="markdown-theme-root markdown-body"
                style={{ ["--viewer-text-width" as string]: `${settings.textWidth}px` }}
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={(event) => void handleContentClick(event)}
              />
            </div>
          </>
        )}
        {isBusy && <div className="busy-indicator">Loading…</div>}
      </section>
    </main>
  );
}

export default App;
