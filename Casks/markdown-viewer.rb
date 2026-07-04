cask "markdown-viewer" do
  version "0.1.0"
  sha256 "5a3ffbe2675d486f60d39e182c0c278330cb1e9c7896fc97ffb22d0f2851f5ac"

  url "https://github.com/ryokbys/markdown-viewer/releases/download/v#{version}/Markdown.Viewer_#{version}_aarch64.dmg"
  name "Markdown Viewer"
  desc "View-only Markdown reader for macOS"
  homepage "https://github.com/ryokbys/markdown-viewer"

  depends_on arch: :arm64

  app "Markdown Viewer.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Markdown Viewer.app"]
  end

  binary "#{appdir}/Markdown Viewer.app/Contents/MacOS/markdown-viewer", target: "mdv"
end
