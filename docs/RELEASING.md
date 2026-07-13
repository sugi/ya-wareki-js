# リリース手順 (0.1.0 公開前チェックリスト)

最終レビュー (2026-07-13) で確定した、npm publish 前に必要な作業。順序に意味がある。

1. **ya-kansuji 0.1.0 を先に npm へ publish する**。
   本パッケージの CI と install は ya-kansuji が registry に存在することが前提 (それまで CI は赤)。
   publish 前に ya-kansuji-js の README「既知の非互換」節を確認する。Ruby 側 ya_kansuji の fix/js-port-findings ブランチ (`"` 受容バグと to_kan 検証の修正) がマージ・リリース済みなら記述を更新する。
2. **データとゴールデンの再生成** (クリーンな状態で)。 [x] 済み (2026-07-13, v2.0.0 基準で再生成済み)
   ツール (`tools/export-data.rb` / `tools/encode-data.mjs` / `tools/gen-golden.rb`) は
   隣接チェックアウト `../wareki` の枝の状態に依存しない。参照先を環境変数
   `WAREKI_DIR` (既定 `../wareki`) で指定し、`.git` を持たないチェックアウト
   (`git archive` でタグを展開したものなど) から生成する場合は provenance スタンプ用に
   `WAREKI_PROVENANCE` を明示する。手順:
   ```sh
   TMPD=$(mktemp -d)
   git -C ../wareki archive v2.0.0 | tar -x -C "$TMPD"   # 対象タグを clean に展開
   WAREKI_DIR=$TMPD WAREKI_PROVENANCE=v2.0.0 ruby tools/export-data.rb
   WAREKI_DIR=$TMPD WAREKI_PROVENANCE=v2.0.0 node tools/encode-data.mjs
   WAREKI_DIR=$TMPD WAREKI_PROVENANCE=v2.0.0 ruby tools/gen-golden.rb
   ```
   `WAREKI_DIR` が `.git` を持つ通常のチェックアウトであれば `WAREKI_PROVENANCE` は省略でき、
   `git -C $WAREKI_DIR describe --always --dirty` の結果がスタンプに使われる。
   `src/data/*.ts` のヘッダコメント行と CSV 先頭の `# wareki: <provenance>` 行以外に
   diff が出ないことを確認してコミットする。
3. ~~**GitHub リポジトリ作成後**: package.json に `repository` / `bugs` / `homepage` を追加する~~ (済 2026-07-13: 両リポジトリ作成・push 済み、フィールド追加済み。CI は sibling checkout で緑)。
4. **lockfile 復帰**: `.gitignore` から package-lock.json を外し、registry の ya-kansuji で `npm install` し直して lockfile をコミット。CI を `npm ci` + `cache: 'npm'` に切り替える (手順は ci.yml のコメントに記載済み)。
5. `npm publish` (prepublishOnly が build/test/publint/attw を再実行する)。リポジトリ公開後は `--provenance` を検討。v0.1.0 タグを打ち、master の CI が緑になることを確認する。

## 残っている軽微な改善候補 (任意)

- WarekiDate が eraYear/year の整数性を検証しない (NaN/小数が西暦経路で NaN jd になる)。
- `VERSION` 定数と package.json version の一致テスト。
- tsdown の `noExternal` 非推奨警告 (`deps.alwaysBundle` へ)。
- parseToDate のフォールバック (`new Date(str)`) は UTC 深夜、和暦パースはローカル深夜になる差の README 追記。
