# リリース手順 (0.1.0 公開前チェックリスト)

最終レビュー (2026-07-13) で確定した、npm publish 前に必要な作業。順序に意味がある。

1. **ya-kansuji 0.1.0 を先に npm へ publish する**。
   本パッケージの CI と install は ya-kansuji が registry に存在することが前提 (それまで CI は赤)。
   publish 前に ya-kansuji-js の README「既知の非互換」節を確認する。Ruby 側 ya_kansuji の fix/js-port-findings ブランチ (`"` 受容バグと to_kan 検証の修正) がマージ・リリース済みなら記述を更新する。
2. **データとゴールデンの再生成** (クリーンな状態で)。
   北朝優先 (PR #24) は wareki の `origin/master` にマージ済みなので、専用ブランチのチェックアウトは不要。
   clean な `origin/master` (またはそれを取り込んだリリースタグ) で
   `tools/export-data.rb` → `node tools/encode-data.mjs` → `tools/gen-golden.rb` を再実行する。
   gen-golden.rb に provenance スタンプ出力を追加してから行う (現状 CSV にスタンプがない)。
   スタンプ行以外に diff が出ないことを確認してコミットする。
3. **GitHub リポジトリ作成後**: package.json に `repository` / `bugs` / `homepage` を追加する (`npm publish --provenance` の必須条件)。
4. **lockfile 復帰**: `.gitignore` から package-lock.json を外し、registry の ya-kansuji で `npm install` し直して lockfile をコミット。CI を `npm ci` + `cache: 'npm'` に切り替える (手順は ci.yml のコメントに記載済み)。
5. `npm publish` (prepublishOnly が build/test/publint/attw を再実行する)。リポジトリ公開後は `--provenance` を検討。v0.1.0 タグを打ち、master の CI が緑になることを確認する。

## 残っている軽微な改善候補 (任意)

- WarekiDate が eraYear/year の整数性を検証しない (NaN/小数が西暦経路で NaN jd になる)。
- `VERSION` 定数と package.json version の一致テスト。
- tsdown の `noExternal` 非推奨警告 (`deps.alwaysBundle` へ)。
- parseToDate のフォールバック (`new Date(str)`) は UTC 深夜、和暦パースはローカル深夜になる差の README 追記。
