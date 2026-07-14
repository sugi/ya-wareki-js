# リリース手順 (0.1.0 公開前チェックリスト)

最終レビュー (2026-07-13) で確定した、npm publish 前に必要な作業。順序に意味がある。

1. ~~**ya-kansuji 0.1.0 を先に npm へ publish する**~~ (済 2026-07-15: ya-kansuji@0.1.0 公開済み。
   これに伴い lockfile を registry 依存で再生成してコミットし、CI を `npm ci` + `cache: 'npm'` へ切り替え、
   ya-kansuji を GitHub からビルドする暫定ステップを削除した)。
2. **データの再生成** (クリーンな状態で)。
   `tools/export-data.mjs` がdata-localeの
   [`kyuureki-map.txt`](https://raw.githubusercontent.com/manakai/data-locale/master/data/calendar/kyuureki-map.txt)と
   [`era-defs.json`](https://raw.githubusercontent.com/manakai/data-locale/master/data/calendar/era-defs.json)の
   最新版を直接取得して生成する。
   オフラインで生成する場合は、あらかじめ同じURLから取得したファイルを
   `KYUUREKI_MAP`と`ERA_DEFS_SOURCE`で指定する。手順:
   ```sh
   node tools/export-data.mjs
   node tools/encode-data.mjs
   ```
   `src/data/year-defs.ts`と`src/data/era-defs.ts`には、各入力のURLとSHA-256が記録される。
   生成後のdiffを確認してコミットする。
3. **Ruby版との比較用ゴールデンの再生成**。
   この手順だけは隣接チェックアウト`../wareki`と`ya_kansuji` gemを必要とする。
   `WAREKI_DIR`で参照先を、`.git`を持たないチェックアウトの場合は
   `WAREKI_PROVENANCE`でバージョン文字列を指定する。
   ```sh
   WAREKI_DIR=../wareki ruby tools/gen-golden.rb
   ```
   Ruby版の`feat/packed-calendar-def`以降にあるビットパック済み旧暦テーブルを
   個別に比較する場合は、元号データの差分に影響されない専用ゴールデンを生成する。
   この生成には`ya_kansuji` gemは不要。
   ```sh
   WAREKI_DIR=../wareki/.claude/worktrees/feat+packed-calendar-def \
     ruby tools/gen-packed-calendar-golden.rb
   ```
4. ~~**GitHub リポジトリ作成後**: package.json に `repository` / `bugs` / `homepage` を追加する~~ (済 2026-07-13: 両リポジトリ作成・push 済み、フィールド追加済み。CI は sibling checkout で緑)。
5. ~~**lockfile復帰**: `.gitignore`からpackage-lock.jsonを外し、registryのya-kansujiで`npm install`し直してlockfileをコミット。CIを`npm ci` + `cache: 'npm'`に切り替える~~ (済 2026-07-15: 手順1と同時に実施)。
6. **CHANGELOG 確定**: `CHANGELOG.md` の `[0.1.0] - 未リリース` の見出しに公開日を記入する。
7. `npm publish` (prepublishOnly が build/test/publint/attw を再実行する)。リポジトリ公開後は `--provenance` を検討。v0.1.0 タグを打ち、master の CI が緑になることを確認する。

## 残っている軽微な改善候補 (任意)

- `VERSION` 定数と package.json version の一致テスト。
- tsdown の `noExternal` 非推奨警告 (`deps.alwaysBundle` へ)。
- parseToDate のフォールバック (`new Date(str)`) は UTC 深夜、和暦パースはローカル深夜になる差の README 追記。
