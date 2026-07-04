cask "markdown-viewer" do
  version "0.1.0"
  sha256 :no_check

  url "file://#{File.expand_path(ENV.fetch("HOMEBREW_MARKDOWN_VIEWER_DMG")).gsub(" ", "%20")}"
  name "Markdown Viewer"
  desc "View-only Markdown reader for macOS"
  homepage "file://#{File.expand_path("..", __dir__)}"

  depends_on arch: :arm64

  app "Markdown Viewer.app"
  binary "#{appdir}/Markdown Viewer.app/Contents/MacOS/markdown-viewer", target: "mdv"
end
