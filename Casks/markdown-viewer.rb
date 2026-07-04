cask "markdown-viewer" do
  version "0.1.0"
  sha256 :no_check

  dmg_path = ENV["HOMEBREW_MARKDOWN_VIEWER_DMG"] || "/tmp/markdown-viewer.dmg"

  url "file://#{File.expand_path(dmg_path).gsub(" ", "%20")}"
  name "Markdown Viewer"
  desc "View-only Markdown reader for macOS"
  homepage "file://#{File.expand_path("..", __dir__)}"

  depends_on arch: :arm64

  app "Markdown Viewer.app"
  binary "#{appdir}/Markdown Viewer.app/Contents/MacOS/markdown-viewer", target: "mdv"
end
