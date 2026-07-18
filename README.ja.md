<div align="center">

# Codex AutoSkin

**画像を 1 枚渡すだけ。あなたの Codex が自分でスキンを着替えます。**

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078d4)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933)
![Release](https://img.shields.io/github/v/release/Finderchangchang/codex-autoskin)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

2 分で反映 · 公式ファイルは一切変更しない · コマンド 1 つで復元 · Windows & macOS

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

[クイックスタート](#-クイックスタート) · [特徴](#-特徴) · [ロードマップ](#-ロードマップ) · [FAQ](#-faq)

</div>

---

## 🎬 実際のデモ

リポジトリの URL と画像 1 枚を Codex に渡し、**「このスキンをインストールして」** と伝えるだけ：

![① ひとことの指示](docs/demo-step1-command.png)

Codex が自分でクローン・インストールし、画像からテーマを生成します：

![② Codex が自律実行](docs/demo-step2-agent.png)

完成——画像 1 枚から専用スキンまで、すべて自動：

![③ 出来上がり](docs/demo-step3-result.png)

> デモ用テーマはファンアート 1 枚から本フローで生成したもので、流れの紹介が目的です。素材の権利は各権利者に帰属します。他人の肖像や著作権で保護された素材を使ってテーマを作成し**公開・配布しない**でください（個人利用は `themes-private/` へ）。

> 📌 **本プロジェクトは「最初の一歩」だけを担います。** Codex はもう誰もが持っています。足りないのは「1 枚の画像を使えるスキンの土台にする」こと（背景 + 配色、全画面 / バナーの 2 レイアウト）——そこを極限までシンプルにしました。枠・ステッカー・カードの細部は自由に発想を。[THEME-SPEC.md](THEME-SPEC.md) をあなたのエージェントに渡してください。チュートリアルは順次公開します。

### ⚡ 最速の使い方：この一文をコピー

下記の一文を、お気に入りの画像（横長・被写体は右寄せ・文字/透かしなし）とともに Codex に送るだけ：

```text
この Codex スキンエンジンをインストールして: https://github.com/Finderchangchang/codex-autoskin 、そのあと添付した画像でテーマを生成してすぐ適用して
```

あとは全自動。画像がなくても内蔵テーマで先に点灯し、あとから追加できます。AI を使いたくない場合は、下のプラットフォーム別の手動手順へ。

<details>
<summary><b>📖 目次</b></summary>

- [特徴](#-特徴)
- [クイックスタート](#-クイックスタート)
- [日常の使い方](#-日常の使い方)
- [自分のテーマを作る](#-自分のテーマを作る)
- [仕組みと安全性](#-仕組みと安全性)
- [ロードマップ](#-ロードマップ)
- [FAQ](#-faq)
- [コントリビュート](#-コントリビュート)
- [プロジェクトについて](#-プロジェクトについて)
- [免責事項](#%EF%B8%8F-免責事項)
- [ライセンス](#-ライセンス)

</details>

## ✨ 特徴

- 🖼 **画像 1 枚でテーマ生成** — Windows はコマンド 1 つ / macOS はダブルクリックで画像選択：自動で配色抽出・明暗ルート判定・生成・即適用
- ⚡ **導入が簡単** — Windows は 2 コマンド；macOS はダブルクリックのみ。Codex 内蔵の Node.js を再利用し、一般ユーザーは依存関係ゼロ
- 📁 **テーマはフォルダ** — `theme.json` 1 つ + 画像 1 枚でテーマ 1 つ。追加・削除にコード変更は不要
- 🤖 **AI による仕上げ（任意）** — リポジトリを Codex / Claude に渡し、[THEME-SPEC.md](THEME-SPEC.md) に沿ってトリミング・文言・ステッカーを深く調整
- 🔒 **安全で可逆** — CDP 注入はループバックのみ。`WindowsApps`・アプリバンドル・`app.asar` には一切触れず、ログイン/セッションは維持。コマンド 1 つで復元
- 🛡 **実戦で鍛えた常駐監視** — デュアルスタックのポート探索、クラッシュのデバウンス + サーキットブレーカー、装飾レイヤーのヒットテスト。Windows は Startup watcher、macOS は LaunchAgent で、Codex 再起動後もスキンを自動復旧

## 🚀 クイックスタート

### Windows：2 つのコマンド

前提：Windows 10/11、Microsoft Store 版 Codex（一度起動・ログイン済み）、[Node.js ≥ 20](https://nodejs.org/ja)。

```powershell
git clone https://github.com/Finderchangchang/codex-autoskin.git   # または Download ZIP で展開
cd codex-autoskin

.\quickstart.ps1                              # ① インストール & 起動 — Codex が内蔵テーマで点灯
.\quick-theme.ps1 -Image C:\path\your.png     # ② あなたの画像がそのままテーマに
```

配色が気に入らない？ 画像を差し替えて再実行するだけ。`-Name 名前` でテーマ名を指定できます。「スクリプトの実行が無効」と出たら [FAQ](#-faq) へ。

### macOS：3 ステップ、ダブルクリックのみ

前提：公式 Codex Mac アプリ（一度起動・ログイン済み）。**Node.js のインストールは不要**——スクリプトが Codex 内蔵のランタイムを再利用します。

1. **ダウンロードして展開**——GitHub → Code → Download ZIP、Finder で `codex-autoskin` フォルダを開く；
2. **ダブルクリックでインストール**——`Install AutoSkin on macOS.command` を開く（Codex 起動中なら再起動の可否を確認します）；
3. **画像を選んで生成**——`Create AutoSkin Theme on macOS.command` を開いて PNG/JPG を選ぶ（ファイルへドラッグしても可）。自動で配色抽出・生成・適用します。

通常インストールは既存の Codex プロファイルを使うため、**プロジェクト・タスク・チャット・ログインは消えません**。「開発元を確認できない」と出たら [FAQ](#-faq) へ。ターミナル版：

```bash
scripts/autoskin-macos.sh install
scripts/autoskin-macos.sh quick-theme "/path/to/your.png" --name my-theme
```

**画像の要件（両プラットフォーム共通）**：PNG / JPG、横長で幅 ≥ 1600px、被写体は右寄せ（左側にタイトルが乗ります）、画像内に文字 / 透かし / UI を含まないこと。素材の権利は各自の責任で確認してください。

<details>
<summary><b>🖼 内蔵テーマのプレビュー（Aurora Veil / Ember Bloom）</b></summary>

| Aurora Veil（暗い画像ルート） | Ember Bloom（明るい画像ルート） |
|---|---|
| ![aurora fullscreen](docs/screenshot-aurora-veil-fullscreen.png) | ![ember fullscreen](docs/screenshot-ember-bloom-fullscreen.png) |
| ![aurora banner](docs/screenshot-aurora-veil-banner.png) | ![ember banner](docs/screenshot-ember-bloom-banner.png) |

> 内蔵テーマの素材はすべてプログラムで生成したオリジナル画像で、実在人物の写真は含みません。スクリーンショットのサイドバーはぼかし、プロジェクト名はデモ用のダミーです。

</details>

<details>
<summary><b>🍎 macOS の応用（安定エントリ / よく使うコマンド）</b></summary>

インストール時に、自己完結型のランタイムを `~/Library/Application Support/CodexDreamSkin/runtime` へアトミックに同期します。個人テーマは隣の `themes-private` に保存され、ランタイム更新でも失われません。ダウンロードしたリポジトリを削除しても、安定エントリから利用できます：

```bash
"$HOME/Library/Application Support/CodexDreamSkin/runtime/scripts/autoskin-macos.sh" start
"$HOME/Library/Application Support/CodexDreamSkin/runtime/scripts/autoskin-macos.sh" quick-theme "/path/to/image.jpg" --name my-theme
```

よく使うコマンド（インストール時に選んだポート / アプリパスは記憶されます）：

```bash
scripts/autoskin-macos.sh doctor                                  # 診断：アプリ、内蔵 Node、状態ディレクトリ、CDP ポート
scripts/autoskin-macos.sh theme ember-bloom fullscreen            # テーマ切替
scripts/autoskin-macos.sh verify --screenshot "$PWD/shot.png"     # 検証 + ネイティブウィンドウ ID でスクショ
scripts/autoskin-macos.sh uninstall                               # 完全アンインストール（繰り返し実行可）
scripts/install-dream-skin.sh --app "$HOME/Apps/ChatGPT.app"      # 非標準のインストール先
scripts/autoskin-macos.sh install --port 19335                    # ポートが埋まっている場合は一度だけ指定
```

トラブルシューティングのログは `~/Library/Application Support/CodexDreamSkin/` に：`injector-error.log`（テーマ走査/注入）、`watcher.log`（自動復旧/ブレーカー）、`launch-agent-error.log`（LaunchAgent）。

</details>

## 🎨 日常の使い方

```powershell
node scripts\set-theme.mjs --list                  # 全テーマを一覧（両プラットフォーム共通）
node scripts\set-theme.mjs aurora-veil fullscreen  # テーマ + レイアウト切替（banner / fullscreen）
scripts\restore-dream-skin.ps1                     # Windows：公式の見た目に復元
```

```bash
scripts/autoskin-macos.sh theme aurora-veil fullscreen   # macOS：テーマ切替
scripts/restore-dream-skin.sh                            # macOS：公式の見た目に復元
```

選択は自動で保存されます。あるいは Codex に「オーロラのテーマに切り替えて」と伝えるだけでも OK。

## 🛠 自分のテーマを作る

**手早く**：Windows は `quick-theme.ps1`、macOS は `quick-theme` コマンド。背景差し替え + 基本配色をカバーし、全画面 / バナーの両レイアウトに対応。

**じっくり**：リポジトリと画像を Codex / Claude に渡し、**「THEME-SPEC.md に従って <テーマ名> テーマを仕上げて」** と伝えます。[THEME-SPEC.md](THEME-SPEC.md) は AI エージェント向けの完全な仕様書です——28 個の配色トークン、4 つの画像ロールのトリミング手順、明暗ルートの判断フロー、受け入れチェックリスト。エージェントはこれを読むだけで、テーマの生成から自己検証まで自律的に行えます。内蔵の [aurora-veil](themes/aurora-veil/theme.json)（暗ルート）と [ember-bloom](themes/ember-bloom/theme.json)（明ルート）が実例です。

## 🔍 仕組みと安全性

構成：PowerShell / POSIX シェル + Node.js + Chrome DevTools Protocol。サードパーティ依存なし。

公式 Codex（Windows は `ChatGPT.exe` / macOS は `ChatGPT.app`、mac では LaunchServices 経由）を `--remote-debugging-port=9335`（ループバック限定）で起動し、CDP でメインレンダラーに CSS + JS を注入します：

- いかなる公式ファイルやアプリバンドルも置換・改変・再署名しません。ログイン / セッション / プラグインはそのまま
- プラットフォーム別の `restore-dream-skin` スクリプトが注入内容をその場で除去。完全アンインストールは Windows で `-Uninstall -RestoreBaseTheme`、macOS で `--uninstall --restore-base-theme`（繰り返し実行可）
- 実行時の状態はすべて `%LOCALAPPDATA%\CodexDreamSkin` / `~/Library/Application Support/CodexDreamSkin` に置かれ、削除すれば痕跡は残りません
- 隠れた watcher が Codex 通常再起動後にスキンを自動復旧（デバウンス + 頻度制限 + 失敗クールダウンで、アプリと衝突しない）。macOS の LaunchAgent はインストール前に開いていた Codex を中断しません
- デスクトップペット等の補助レンダラーには注入せず、透明を維持します

> スクリプト名や内部識別子は `dream` プレフィックスのまま——デフォルトのスタイルパック名であり、初代へのオマージュです。

## 🗺 ロードマップ

- [x] 2 コマンドのコールドスタート（quickstart / quick-theme）
- [x] 画像 1 枚からの自動配色テーマ生成（明 / 暗ルート）
- [x] AI 仕上げ仕様 THEME-SPEC.md
- [x] macOS 対応 —— ✅ コミュニティ貢献、感謝 [@keyuchen21](https://github.com/keyuchen21)
- [ ] デモ GIF / 動画チュートリアルシリーズ
- [ ] コミュニティテーマギャラリー
- [ ] スタイルパックの追加（現在は内蔵の `dream` スタイル）

## ❓ FAQ

**Windows で「スクリプトの実行が無効」と出る？**
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` を実行。ZIP でダウンロードした場合はさらに `Get-ChildItem -Recurse | Unblock-File`。

**macOS で「開発元を確認できない」と出る？**
`.command` ファイルを右クリック → **開く** で一度確認。実行権限がない場合はリポジトリ内で `chmod +x ./*.command ./scripts/*.sh`。ダウンロード隔離でまだブロックされ、本リポジトリ由来だと確認できる場合は `xattr -dr com.apple.quarantine "/path/to/codex-autoskin"`。

**macOS でスクショ検証に失敗する？**
コマンドを実行するターミナル（またはエージェント）に「画面収録」権限を付与して再試行してください——mac ではネイティブウィンドウ ID で撮るため、他のウィンドウが重なっても正しく撮れます。

**Codex 更新後にスキンが消えた？**
Windows は `.\quickstart.ps1`、macOS は `scripts/autoskin-macos.sh install` を再実行。どちらも現在のアプリを動的に検出し、バージョン依存のパスは保存しません。

**ポート 9335 が使用中？**
Windows：`.\quickstart.ps1 -Port 9345`（以降のスクリプトも同じポートで）。macOS：`scripts/autoskin-macos.sh install --port 19335`（以降の統合コマンドが記憶します）。

**Codex のアカウントやデータに影響は？**
ありません。公式ファイルを変更せず、ログインやセッションにも触れず、注入はループバックのみ。装飾目的のコミュニティプロジェクトです（[免責事項](#%EF%B8%8F-免責事項)参照）。

**パフォーマンスへの影響は？**
純粋な CSS/JS 装飾レイヤーと軽量な常駐プロセスだけで、通常利用では体感できません。

**完全にアンインストールするには？**
Windows：`scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme`。macOS：`scripts/autoskin-macos.sh uninstall`。その後は通常どおり Codex を起動すれば公式のままです。

**対応プラットフォームは？**
Windows（Store 版 Codex）と macOS（公式デスクトップアプリ）。Linux はまだ未対応——PR 歓迎です。

## 🤝 コントリビュート

歓迎する 3 種類の貢献：**新しいテーマ**（`themes/` フォルダ + スクリーンショットで PR）、**プラットフォーム対応 / エンジン修正**、**ドキュメント & チュートリアル**。詳細は [CONTRIBUTING.md](CONTRIBUTING.md)。

## 💬 プロジェクトについて

CDP 注入で Codex を着せ替えるという発想の初代（当時は **Dream Skin**）は私が作りました。この遊びがコミュニティに広がっていくのを見られて嬉しく思います。AutoSkin はその全面リライトです：v1 は「Codex を着せ替えられるか？」に答え、この版は「誰もが画像 1 枚で自分のスキンを得るには？」に答えます。

2.0 は一貫して AI とのペアプログラミングで作りました。方針・設計から失敗の一つひとつまで、意思決定の全記録を [DEVLOG.md](DEVLOG.md) で公開しています——最後まで透明なサイバー開発の実験で、更新を続けます。macOS 対応はコミュニティ貢献者 [@keyuchen21](https://github.com/keyuchen21) によるもので、公開の翌日に届きました——オープンソースが本来のかたちで機能した瞬間です。

## ⚠️ 免責事項

- 装飾目的のコミュニティプロジェクトであり、**OpenAI とは無関係**です。Codex および関連する商標は各権利者に帰属します。
- Codex デスクトップの更新で内部構造が変わり、再対応が必要になる場合があります（エンジンはセマンティックなセレクタで特定するため、小さな更新は通常そのまま動きます）。
- 自作テーマの素材の著作権・肖像権は各自の責任です。他人の肖像を使ってテーマを作成し公開・配布しないでください。個人テーマは gitignore 済みの `themes-private/` に置いてください。

## 📄 ライセンス

[MIT](LICENSE) © Vikicc
