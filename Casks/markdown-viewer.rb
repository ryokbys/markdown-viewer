cask "markdown-viewer" do
  version "0.1.0"
  sha256 "5760af599c05d86d212112c489bc4505820994a6af8dfb268796278fe37d3a0c"

  url "https://github.com/ryokbys/markdown-viewer/releases/download/v#{version}/Markdown%20Viewer_#{version}_aarch64.dmg"
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
