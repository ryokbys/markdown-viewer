# Markdown Viewer 手動確認チェックリスト

## 事前準備

### 1. アプリ起動

- `npm run tauri dev` で起動
  または
- `src-tauri/target/debug/bundle/macos/Markdown Viewer.app` を起動

### 2. サンプル文書

- 開くファイル: `samples/demo.md`
- 相対リンク先: `samples/linked.md`
- 相対画像: `samples/assets/sample-diagram.svg`

### 3. テーマサンプル

以下をコピーしておく:

- `samples/themes/sepia.css`
- `samples/themes/ocean.css`

コピー先:

- `~/Library/Application Support/com.kobayashi.markdownviewer/themes/`

---

## チェック項目

### A. ファイルオープン

- [ ] `Open…` から `samples/demo.md` を開ける
- [ ] Finder から `samples/demo.md` をドラッグ&ドロップして開ける
- [ ] タイトル表示が `demo.md` になる

### B. Markdown表示

- [ ] 見出し、リスト、引用、表が崩れず表示される
- [ ] タスクリストのチェックボックスが表示される
- [ ] コードブロックがハイライトされる
- [ ] インライン数式 `$e^{i\pi} + 1 = 0$` が描画される
- [ ] ブロック数式が KaTeX で描画される

### C. リンク挙動

- [ ] `数式セクションへ` で同一文書内スクロール移動できる
- [ ] `コードセクションへ` で同一文書内スクロール移動できる
- [ ] `別ページへ移動` で `linked.md` に同一ウィンドウ遷移する
- [ ] `linked.md` の `元のページへ戻る` で `demo.md` に戻れる
- [ ] 外部リンク `Tauri` または `React` を押すと既定ブラウザで開く

### D. 画像とHTML

- [ ] `sample-diagram.svg` が表示される
- [ ] `HTML block` が表示される
- [ ] `script` タグの内容は実行されず、画面にも不要表示されない

### E. 表示設定

- [ ] Theme セレクトに `GitHub Light` がある
- [ ] Theme セレクトに `sepia` と `ocean` が追加される
- [ ] Theme を切り替えると本文領域だけ見た目が変わる
- [ ] Font Size を変えると本文文字サイズが変わる
- [ ] Text Width の `%` を変えると本文幅と横の `px` 表示が更新される

### F. テーマ監視

- [ ] アプリ起動中に theme ディレクトリへ CSS を追加すると一覧に反映される
- [ ] `sepia.css` または `ocean.css` を編集すると表示へ再反映される
- [ ] 壊れた CSS に差し替えたとき既定テーマへ戻り、エラー表示される

### G. ファイル監視

- [ ] `samples/demo.md` を外部エディタで変更すると自動再描画される
- [ ] 再描画後もスクロール位置が大きく飛ばない

### H. 制約確認

- [ ] `.txt` ファイルを開こうとすると拒否される
- [ ] Markdown 内の外部画像 URL は自動表示されない
- [ ] `../` を含む相対参照は拒否される

---

## 簡易確認フロー

1. `samples/demo.md` を開く
2. 数式・コード・表・画像を確認
3. `別ページへ移動` → `元のページへ戻る` を確認
4. Theme を `sepia` / `ocean` に切替
5. Font Size / Text Width を切替
6. `samples/demo.md` を外部エディタで編集して自動更新確認
7. theme ディレクトリの CSS を編集して自動更新確認

---

## 合格条件

- 主要表示要素が崩れない
- 相対リンクと相対画像が正しく動く
- 外部URLだけがブラウザで開く
- 監視による自動更新が効く
- テーマ追加と切替が動く
- 制約事項が破られない
