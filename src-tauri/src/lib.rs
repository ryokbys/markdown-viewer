use std::{
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
};

#[cfg(target_os = "macos")]
use std::sync::mpsc;

use anyhow::{anyhow, Context};
use base64::{engine::general_purpose::STANDARD, Engine};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSDataWritingOptions, NSString};
#[cfg(target_os = "macos")]
use objc2_web_kit::WKWebView;

const DOCUMENT_UPDATED_EVENT: &str = "document-updated";
const DOCUMENT_OPEN_REQUESTED_EVENT: &str = "document-open-requested";
const THEMES_UPDATED_EVENT: &str = "themes-updated";
const DEFAULT_THEME_ID: &str = "default";

#[derive(Default)]
struct AppState {
    document_watcher: Mutex<Option<RecommendedWatcher>>,
    theme_watcher: Mutex<Option<RecommendedWatcher>>,
    pending_open_path: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentPayload {
    path: String,
    title: String,
    markdown: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemeOption {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ViewerSettings {
    font_size: u16,
    #[serde(alias = "textWidth")]
    text_width_percent: u16,
    theme: String,
}

impl Default for ViewerSettings {
    fn default() -> Self {
        Self {
            font_size: 16,
            text_width_percent: 70,
            theme: DEFAULT_THEME_ID.to_string(),
        }
    }
}

impl ViewerSettings {
    fn normalized(mut self) -> Self {
        self.font_size = self.font_size.clamp(14, 26);
        self.text_width_percent = normalize_text_width_percent(self.text_width_percent);
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownChangedEvent {
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemesChangedEvent {
    directory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalLinkResolution {
    kind: String,
    path: String,
    anchor: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
fn open_markdown_document(path: String) -> Result<DocumentPayload, String> {
    read_markdown_document(&path).map_err(error_message)
}

#[tauri::command(rename_all = "camelCase")]
fn watch_markdown_document(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let canonical = canonical_markdown_path(&path).map_err(error_message)?;
    let watched_path = canonical.clone();
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |event: Result<Event, notify::Error>| {
        if let Ok(event) = event {
            if !is_relevant_fs_event(&event.kind) {
                return;
            }
            let payload = MarkdownChangedEvent {
                path: watched_path.to_string_lossy().into_owned(),
            };
            let _ = app_handle.emit(DOCUMENT_UPDATED_EVENT, payload);
        }
    })
    .map_err(error_message)?;

    watcher
        .watch(&canonical, RecursiveMode::NonRecursive)
        .map_err(error_message)?;

    *state.document_watcher.lock() = Some(watcher);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn list_user_themes(app: AppHandle) -> Result<Vec<ThemeOption>, String> {
    let dir = ensure_theme_dir(&app).map_err(error_message)?;
    let mut themes = fs::read_dir(dir)
        .map_err(error_message)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let extension = path.extension()?.to_str()?;
            if extension != "css" {
                return None;
            }
            let stem = path.file_stem()?.to_str()?.to_string();
            Some(ThemeOption {
                id: stem.clone(),
                name: stem.replace(['-', '_'], " "),
            })
        })
        .collect::<Vec<_>>();

    themes.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(themes)
}

#[tauri::command(rename_all = "camelCase")]
fn read_theme_css(app: AppHandle, theme_id: String) -> Result<String, String> {
    let path = theme_path(&app, &theme_id).map_err(error_message)?;
    fs::read_to_string(path).map_err(error_message)
}

#[tauri::command(rename_all = "camelCase")]
fn load_settings(app: AppHandle) -> Result<ViewerSettings, String> {
    let path = settings_path(&app).map_err(error_message)?;
    if !path.exists() {
        return Ok(ViewerSettings::default());
    }

    let content = fs::read_to_string(path).map_err(error_message)?;
    Ok(serde_json::from_str::<ViewerSettings>(&content)
        .unwrap_or_default()
        .normalized())
}

#[tauri::command(rename_all = "camelCase")]
fn save_settings(app: AppHandle, settings: ViewerSettings) -> Result<(), String> {
    let path = settings_path(&app).map_err(error_message)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(error_message)?;
    }
    let serialized =
        serde_json::to_string_pretty(&settings.normalized()).map_err(error_message)?;
    fs::write(path, serialized).map_err(error_message)
}

#[tauri::command(rename_all = "camelCase")]
async fn export_current_pdf(
    window: tauri::WebviewWindow,
    output_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        export_current_pdf_macos(window, output_path)
            .await
            .map_err(error_message)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        let _ = output_path;
        Err("PDF export is only available on macOS.".to_string())
    }
}

#[cfg(target_os = "macos")]
async fn export_current_pdf_macos(
    window: tauri::WebviewWindow,
    output_path: String,
) -> anyhow::Result<()> {
    let (sender, receiver) = mpsc::channel::<Result<(), String>>();

    window
        .eval("document.documentElement.classList.add('pdf-export-mode'); document.body.classList.add('pdf-export-mode');")
        .map_err(|error| anyhow!(error.to_string()))?;
    std::thread::sleep(std::time::Duration::from_millis(50));

    let export_result = (|| -> anyhow::Result<()> {
        window.with_webview(move |webview| unsafe {
            let view: &WKWebView = &*webview.inner().cast();
            let callback_path = output_path.clone();
            let handler = RcBlock::new(
                move |data: *mut objc2_foundation::NSData, error: *mut objc2_foundation::NSError| {
                    if let Some(error) = error.as_ref() {
                        let _ = sender.send(Err(error.to_string()));
                        return;
                    }

                    let Some(data) = data.as_ref() else {
                        let _ = sender.send(Err("PDF data was empty.".to_string()));
                        return;
                    };

                    let path = NSString::from_str(&callback_path);
                    let result = data
                        .writeToFile_options_error(&path, NSDataWritingOptions::Atomic)
                        .map_err(|error| error.to_string());
                    let _ = sender.send(result);
                },
            );
            view.createPDFWithConfiguration_completionHandler(None, &handler);
        })?;

        receiver
            .recv()
            .map_err(|_| anyhow!("PDF export callback was dropped."))?
            .map_err(|message| anyhow!(message))
    })();

    let _ = window.eval("document.documentElement.classList.remove('pdf-export-mode'); document.body.classList.remove('pdf-export-mode');");
    export_result
}

#[tauri::command(rename_all = "camelCase")]
fn load_image_asset(document_path: String, source: String) -> Result<String, String> {
    let path = resolve_relative_target(&document_path, &source).map_err(error_message)?;
    let bytes = fs::read(&path).map_err(error_message)?;
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    Ok(format!(
        "data:{};base64,{}",
        mime.essence_str(),
        STANDARD.encode(bytes)
    ))
}

#[tauri::command(rename_all = "camelCase")]
fn resolve_local_link(document_path: String, href: String) -> Result<LocalLinkResolution, String> {
    let (raw_path, anchor) = split_link_target(&href);
    let path = resolve_relative_target(&document_path, raw_path).map_err(error_message)?;
    let kind = if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        "markdown"
    } else {
        "file"
    };

    Ok(LocalLinkResolution {
        kind: kind.to_string(),
        path: path.to_string_lossy().into_owned(),
        anchor,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn get_launch_markdown_path(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let queued = state.pending_open_path.lock().take();
    Ok(queued.or_else(|| {
        launch_markdown_path()
            .ok()
            .flatten()
            .map(|path| path.to_string_lossy().into_owned())
    }))
}

fn normalize_text_width_percent(value: u16) -> u16 {
    const PRESETS: [u16; 4] = [60, 70, 80, 90];

    let mut normalized = value;
    if normalized > 100 {
        normalized = ((normalized as f32 / 1100.0) * 100.0).round() as u16;
    }

    PRESETS
        .into_iter()
        .min_by_key(|preset| preset.abs_diff(normalized))
        .unwrap_or(70)
}

fn split_link_target(href: &str) -> (&str, Option<String>) {
    match href.split_once('#') {
        Some((path, anchor)) => (path, Some(anchor.to_string())),
        None => (href, None),
    }
}

fn read_markdown_document(path: &str) -> anyhow::Result<DocumentPayload> {
    let canonical = canonical_markdown_path(path)?;
    let markdown = fs::read_to_string(&canonical)
        .with_context(|| format!("Markdown を読めません: {}", canonical.display()))?;
    let title = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();

    Ok(DocumentPayload {
        path: canonical.to_string_lossy().into_owned(),
        title,
        markdown,
    })
}

fn canonical_markdown_path(path: &str) -> anyhow::Result<PathBuf> {
    let candidate = PathBuf::from(path);
    if candidate
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("md"))
    {
        return Err(anyhow!("`.md` ファイルだけ開けます。"));
    }

    let canonical = candidate
        .canonicalize()
        .with_context(|| format!("ファイルを開けません: {}", candidate.display()))?;

    if !canonical.is_file() {
        return Err(anyhow!("ファイルではありません: {}", canonical.display()));
    }

    Ok(canonical)
}

fn resolve_relative_target(document_path: &str, raw_target: &str) -> anyhow::Result<PathBuf> {
    if raw_target.trim().is_empty() {
        return Err(anyhow!("リンク先が空です。"));
    }

    if raw_target.starts_with("http://") || raw_target.starts_with("https://") {
        return Err(anyhow!("外部 URL はここでは解決しません。"));
    }

    let decoded = urlencoding::decode(raw_target)
        .map_err(|_| anyhow!("リンクを解釈できません: {raw_target}"))?
        .into_owned();
    let relative = PathBuf::from(decoded);

    if relative.is_absolute() || escapes_base_dir(&relative) {
        return Err(anyhow!("基準ディレクトリの外側は参照できません。"));
    }

    let document = canonical_markdown_path(document_path)?;
    let base_dir = document
        .parent()
        .ok_or_else(|| anyhow!("基準ディレクトリを決定できません。"))?
        .canonicalize()
        .context("基準ディレクトリを正規化できません。")?;

    let target = base_dir.join(relative);
    let canonical = target
        .canonicalize()
        .with_context(|| format!("リンク先を開けません: {}", target.display()))?;

    if !canonical.starts_with(&base_dir) {
        return Err(anyhow!("基準ディレクトリの外側は参照できません。"));
    }

    Ok(canonical)
}

fn escapes_base_dir(path: &Path) -> bool {
    path.components().any(|component| matches!(component, Component::ParentDir))
}

fn settings_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let app_dir = app
        .path()
        .app_data_dir()
        .context("アプリ設定ディレクトリを取得できません。")?;
    fs::create_dir_all(&app_dir).context("アプリ設定ディレクトリを作成できません。")?;
    Ok(app_dir.join("config.json"))
}

fn ensure_theme_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("テーマディレクトリを取得できません。")?
        .join("themes");
    fs::create_dir_all(&dir).context("テーマディレクトリを作成できません。")?;
    Ok(dir)
}

fn theme_path(app: &AppHandle, theme_id: &str) -> anyhow::Result<PathBuf> {
    if !is_safe_theme_id(theme_id) {
        return Err(anyhow!("不正なテーマ名です。"));
    }
    Ok(ensure_theme_dir(app)?.join(format!("{theme_id}.css")))
}

fn is_safe_theme_id(theme_id: &str) -> bool {
    !theme_id.is_empty()
        && theme_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
}

fn launch_markdown_path() -> anyhow::Result<Option<PathBuf>> {
    let args = std::env::args_os().skip(1).collect::<Vec<OsString>>();

    for arg in args {
        let candidate = PathBuf::from(&arg);
        let as_text = candidate.to_string_lossy();
        if as_text.starts_with("-psn_") {
            continue;
        }
        if candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            && candidate.exists()
        {
            return Ok(Some(candidate.canonicalize()?));
        }
    }

    Ok(None)
}

fn is_relevant_fs_event(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_))
}

fn start_theme_watcher(app: &AppHandle, state: &AppState) -> anyhow::Result<()> {
    let directory = ensure_theme_dir(app)?;
    let app_handle = app.clone();
    let directory_text = directory.to_string_lossy().into_owned();

    let mut watcher = notify::recommended_watcher(move |event: Result<Event, notify::Error>| {
        if let Ok(event) = event {
            if !is_relevant_fs_event(&event.kind) {
                return;
            }
            let payload = ThemesChangedEvent {
                directory: directory_text.clone(),
            };
            let _ = app_handle.emit(THEMES_UPDATED_EVENT, payload);
        }
    })?;

    watcher.watch(&directory, RecursiveMode::NonRecursive)?;
    *state.theme_watcher.lock() = Some(watcher);
    Ok(())
}

fn error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{canonical_markdown_path, normalize_text_width_percent, resolve_relative_target};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn canonical_markdown_path_accepts_md_only() {
        let dir = tempdir().expect("temp dir");
        let markdown = dir.path().join("note.md");
        let text = dir.path().join("note.txt");

        fs::write(&markdown, "# heading").expect("write markdown");
        fs::write(&text, "plain text").expect("write text");

        let resolved = canonical_markdown_path(markdown.to_str().expect("markdown path"))
            .expect("markdown should resolve");
        assert_eq!(resolved, markdown.canonicalize().expect("canonical markdown"));
        assert!(canonical_markdown_path(text.to_str().expect("text path")).is_err());
    }

    #[test]
    fn resolve_relative_target_allows_same_directory_assets() {
        let dir = tempdir().expect("temp dir");
        let markdown = dir.path().join("note.md");
        let image = dir.path().join("image.png");

        fs::write(&markdown, "# note").expect("write markdown");
        fs::write(&image, "png").expect("write image");

        let resolved = resolve_relative_target(
            markdown.to_str().expect("markdown path"),
            "image.png",
        )
        .expect("same-directory image should resolve");

        assert_eq!(resolved, image.canonicalize().expect("canonical image"));
    }

    #[test]
    fn resolve_relative_target_rejects_parent_escape() {
        let dir = tempdir().expect("temp dir");
        let docs = dir.path().join("docs");
        let markdown = docs.join("note.md");

        fs::create_dir_all(&docs).expect("create docs");
        fs::write(&markdown, "# note").expect("write markdown");

        let error = resolve_relative_target(
            markdown.to_str().expect("markdown path"),
            "../secret.png",
        )
        .expect_err("parent traversal must fail");

        assert!(error.to_string().contains("基準ディレクトリの外側"));
    }

    #[test]
    fn normalize_text_width_percent_migrates_old_pixel_values() {
        assert_eq!(normalize_text_width_percent(760), 70);
        assert_eq!(normalize_text_width_percent(1200), 90);
        assert_eq!(normalize_text_width_percent(83), 80);
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = app.state::<AppState>();
            start_theme_watcher(&app_handle, &state)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_markdown_document,
            watch_markdown_document,
            list_user_themes,
            read_theme_css,
            load_settings,
            save_settings,
            export_current_pdf,
            load_image_asset,
            resolve_local_link,
            get_launch_markdown_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            let next_path = urls.into_iter().find_map(|url| {
                let path = url.to_file_path().ok()?;
                let extension = path.extension()?.to_str()?;
                extension
                    .eq_ignore_ascii_case("md")
                    .then(|| path.to_string_lossy().into_owned())
            });

            if let Some(path) = next_path {
                let state = app_handle.state::<AppState>();
                *state.pending_open_path.lock() = Some(path.clone());
                let _ = app_handle.emit(
                    DOCUMENT_OPEN_REQUESTED_EVENT,
                    MarkdownChangedEvent { path },
                );
            }
        }
    });
}
