# UI 日本語化 — 用語集(必ずこの訳語を使うこと)

Web Video Studio の UI 表示文字列をすべて日本語にする。訳語は **Adobe Premiere Pro 日本語版の表記** に合わせる。
このファイルにある語は**必ずこの表記**を使い、勝手に言い換えないこと。ここに無い語は、Premiere 日本語版の慣例に沿って自然な日本語にする。

## 大原則

- **翻訳対象**: 画面に表示される文字列すべて — パネル名、タブ、メニュー、ボタン、ラベル、プレースホルダー、`title` ツールチップ、空状態の案内文、トースト、ダイアログ本文、確認文、単位表記。
- **翻訳しない**: コード識別子、CSS クラス、`dataTransfer` の MIME 文字列、`ui.openDialog` の値、ストアのアクション名・`mutate(label)` の第1引数(**ヒストリーパネルが英語ラベルを日本語表示に変換する**ため、ラベル自体は英語のまま)、プロジェクトデータ(ビン名 `01_FOOTAGE`、素材名 `A010_skyline_pan`、シーケンス名 `CITY_PULSE_MAIN`)、タイムコード、数値。
- 製品名・固有名詞は原則そのまま: `Lumetri`、`H.264`、`WebM`、`VP9`、`AAC`、`Opus`、`WAV`、`PNG`、`SRT`、`VTT`、`WebCodecs`、`fps`、`Mbps`、`kbps`、`dB`、`Hz`。
- ショートカット表記(`⌘Z`、`V`、`Space`)はそのまま。ツールチップは `名称 (キー)` の形式: `選択ツール (V)`。
- 句読点は `、` `。`。感嘆符は使わない。UI ラベル末尾に `。` は付けない(本文・案内文には付ける)。
- 英数字と日本語の間に半角スペースは入れない(`30fps`、`1080p 書き出し`)。ただし単語区切りが必要なら可。

## パネル / ワークスペース

| 英語 | 日本語 |
|---|---|
| Project | プロジェクト |
| Source Monitor | ソースモニター |
| Program Monitor | プログラムモニター |
| Program: <seq> | プログラム: <seq> |
| Timeline | タイムライン |
| Effects | エフェクト |
| Effect Controls | エフェクトコントロール |
| Lumetri Color | Lumetriカラー |
| Essential Sound | エッセンシャルサウンド |
| Essential Graphics | エッセンシャルグラフィックス |
| Captions | キャプション |
| History | ヒストリー |
| Audio Clip Mixer | オーディオクリップミキサー |
| Audio Track Mixer | オーディオトラックミキサー |
| Media Browser | メディアブラウザー |
| Workspace | ワークスペース |
| Import / Edit / Export(ヘッダー) | 読み込み / 編集 / 書き出し |
| Assembly / Editing / Color / Effects / Audio / Graphics / Captions / Review | アセンブリ / 編集 / カラー / エフェクト / オーディオ / グラフィック / キャプション / レビュー |
| Share | 共有 |
| Panel menu | パネルメニュー |

## メニューバー

| 英語 | 日本語 |
|---|---|
| File / Edit / Clip / Sequence / Markers / Graphics / Window / Help | ファイル / 編集 / クリップ / シーケンス / マーカー / グラフィック / ウィンドウ / ヘルプ |
| New | 新規 |
| New Project | 新規プロジェクト |
| Open Project | プロジェクトを開く |
| Close Project | プロジェクトを閉じる |
| Save / Save As / Save a Copy | 保存 / 別名で保存 / コピーを保存 |
| Revert | 復帰 |
| Import | 読み込み |
| Export | 書き出し |
| Media | メディア |
| Project Settings | プロジェクト設定 |
| Exit | 終了 |
| Undo / Redo | 取り消し / やり直し |
| Cut / Copy / Paste | カット / コピー / ペースト |
| Paste Insert | インサートペースト |
| Paste Attributes | 属性をペースト |
| Clear | 消去 |
| Duplicate | 複製 |
| Select All / Deselect All | すべてを選択 / 選択を解除 |
| Keyboard Shortcuts | キーボードショートカット |
| Preferences | 環境設定 |
| About | <アプリ名>について |
| Rename | 名前を変更 |
| Make Offline | オフラインにする |
| Modify | 変更 |
| Video Options / Audio Options | ビデオオプション / オーディオオプション |
| Frame Hold | フレーム保持 |
| Speed/Duration | 速度・デュレーション |
| Enable | 有効 |
| Link / Unlink | リンク / リンク解除 |
| Group / Ungroup | グループ化 / グループ解除 |
| Nest | ネスト |
| Synchronize | 同期 |
| Merge Clips | クリップを結合 |
| Create Multi-Camera Source Sequence | マルチカメラソースシーケンスを作成 |
| Sequence Settings | シーケンス設定 |
| Render Effects In to Out | インからアウトのエフェクトをレンダリング |
| Render In to Out | インからアウトをレンダリング |
| Add Tracks / Delete Tracks | トラックを追加 / トラックを削除 |
| Apply Video Transition / Apply Audio Transition | ビデオトランジションを適用 / オーディオトランジションを適用 |
| Add Edit | 編集点を追加 |
| Add Edit to All Tracks | すべてのトラックに編集点を追加 |
| Trim Edit | トリミング編集 |
| Match Frame | 一致フレーム |
| Lift / Extract | リフト / 抽出 |
| Close Gap | 間隔を詰める |
| Zoom In / Zoom Out | ズームイン / ズームアウト |
| Add Marker | マーカーを追加 |
| Go to Next Marker / Go to Previous Marker | 次のマーカーへ移動 / 前のマーカーへ移動 |
| Clear Marker / Clear All Markers | マーカーを消去 / すべてのマーカーを消去 |
| Edit Marker | マーカーを編集 |
| Mark In / Mark Out | インをマーク / アウトをマーク |
| Clear In / Clear Out / Clear In and Out | インを消去 / アウトを消去 / インとアウトを消去 |
| Add Text Layer | テキストレイヤーを追加 |
| New Shape | 新規シェイプ |
| Align / Distribute | 整列 / 分布 |
| Upgrade Caption to Graphic | キャプションをグラフィックにアップグレード |
| Install Motion Graphics Template | モーショングラフィックステンプレートをインストール |
| Workspaces | ワークスペース |
| Reset to Saved Layout | 保存されたレイアウトにリセット |

## ツール(ツールパレット)

| 英語 | 日本語 |
|---|---|
| Selection Tool | 選択ツール |
| Track Select Forward Tool | 前方トラック選択ツール |
| Track Select Backward Tool | 後方トラック選択ツール |
| Ripple Edit Tool | リップルツール |
| Rolling Edit Tool | ローリングツール |
| Rate Stretch Tool | レート調整ツール |
| Razor Tool | レーザーツール |
| Slip Tool | スリップツール |
| Slide Tool | スライドツール |
| Pen Tool | ペンツール |
| Hand Tool | 手のひらツール |
| Zoom Tool | ズームツール |
| Type Tool | 横書き文字ツール |
| Snap in Timeline | タイムラインにスナップ |

## トランスポート / モニター

| 英語 | 日本語 |
|---|---|
| Play / Pause | 再生 / 一時停止 |
| Step Back 1 Frame / Step Forward 1 Frame | 1フレーム前へ / 1フレーム後へ |
| Go to Start / Go to End | 開始位置へ移動 / 終了位置へ移動 |
| Go to In / Go to Out | インへ移動 / アウトへ移動 |
| Go to Previous Edit Point / Go to Next Edit Point | 前の編集点へ移動 / 次の編集点へ移動 |
| Loop Playback | ループ再生 |
| Insert / Overwrite | インサート / 上書き |
| Lift / Extract | リフト / 抽出 |
| Playback Resolution | 再生時の解像度 |
| Full / 1/2 / 1/4 / 1/8 | フル / 1/2 / 1/4 / 1/8 |
| Safe Margins | セーフマージン |
| Transparency Grid | 透明グリッド |
| Export Frame | フレームを書き出し |
| Monitor settings | モニター設定 |
| Fit | 全体表示 |
| Preview quality | プレビュー画質 |
| Video Only / Audio Only | ビデオのみ / オーディオのみ |
| Dropped frames | ドロップフレーム |
| Multi-Camera (not available) | マルチカメラ(未対応) |
| Comparison View (not available) | 比較表示(未対応) |
| Drag media here or double-click a Project item | 素材をここにドラッグ、またはプロジェクトの項目をダブルクリック |

## タイムライン / トラックヘッダー

| 英語 | 日本語 |
|---|---|
| Toggle Track Output | トラック出力の切り替え |
| Mute Track | トラックをミュート |
| Solo Track | トラックをソロ |
| Sync Lock | 同期ロック |
| Toggle Track Lock | トラックのロック切り替え |
| Source Patch | ソースパッチ |
| Track Target | ターゲットトラック |
| Zoom to Fit | 全体を表示 |
| Ripple Delete | リップル削除 |
| Apply Default Transition | デフォルトのトランジションを適用 |
| Label | ラベル |
| Set Duration | デュレーションを設定 |
| Remove Transition | トランジションを削除 |

### ラベルカラー(`LABEL_NAMES_JA` を使うこと)

violet=バイオレット / iris=アイリス / caribbean=カリビアン / lavender=ラベンダー / cerulean=セルリアン / forest=フォレスト / rose=ローズ / mango=マンゴー / purple=パープル / blue=ブルー / teal=ティール / brown=ブラウン / yellow=イエロー

## エフェクトコントロール

| 英語 | 日本語 |
|---|---|
| Motion | モーション |
| Position | 位置 |
| Scale | スケール |
| Scale Width | スケール(幅) |
| Uniform Scale | 縦横比を固定 |
| Rotation | 回転 |
| Anchor Point | アンカーポイント |
| Anti-flicker Filter | ちらつき防止フィルター |
| Opacity | 不透明度 |
| Blend Mode | 描画モード |
| Mask | マスク |
| Add Ellipse Mask / Add Rect Mask | 楕円形マスクを追加 / 長方形マスクを追加 |
| Mask Feather | マスクの境界のぼかし |
| Mask Opacity | マスクの不透明度 |
| Inverted | 反転 |
| Time Remapping | 時間補間 |
| Speed | 速度 |
| Volume | ボリューム |
| Level | レベル |
| Pan | パン |
| Toggle Animation | アニメーションのオン/オフ |
| Add/Remove Keyframe | キーフレームの追加/削除 |
| Go to Previous Keyframe / Next Keyframe | 前のキーフレームへ移動 / 次のキーフレームへ移動 |
| Reset | リセット |
| No clip selected | クリップが選択されていません |
| Linear / Bezier / Ease In / Ease Out / Ease In-Out / Hold | リニア / ベジェ / イーズイン / イーズアウト / イーズインアウト / 停止 |

### 描画モード(Blend Mode)

normal=通常 / multiply=乗算 / screen=スクリーン / overlay=オーバーレイ / soft-light=ソフトライト / hard-light=ハードライト / lighten=比較(明) / darken=比較(暗) / color-dodge=覆い焼きカラー / color-burn=焼き込みカラー / difference=差の絶対値 / exclusion=除外 / hue=色相 / color=カラー / luminosity=輝度

## Lumetriカラー

| 英語 | 日本語 |
|---|---|
| Basic Correction | 基本補正 |
| White Balance | ホワイトバランス |
| Temperature | 色温度 |
| Tint | 色かぶり補正 |
| Tone | 階調 |
| Exposure | 露光量 |
| Contrast | コントラスト |
| Highlights / Shadows | ハイライト / シャドウ |
| Whites / Blacks | 白レベル / 黒レベル |
| Saturation | 彩度 |
| Creative | クリエイティブ |
| Look | ルック |
| Vibrance | 自然な彩度 |
| Vignette | ビネット |
| Amount / Midpoint / Feather | 適用量 / 中間点 / ぼかし |
| Add Lumetri Color | Lumetriカラーを追加 |
| ルック名 | None=なし / Teal & Orange=ティール&オレンジ / Noir=ノワール / Vivid=ビビッド / Faded Film=フェードフィルム |

## エッセンシャルグラフィックス / テキスト

| 英語 | 日本語 |
|---|---|
| Browse / Edit(タブ) | 参照 / 編集 |
| Text / Rectangle / Ellipse / Line | テキスト / 長方形 / 楕円形 / 線 |
| Font | フォント |
| Weight | ウェイト |
| Italic | イタリック |
| Size | サイズ |
| Letter Spacing | 字間 |
| Line Height | 行送り |
| Align | 整列 |
| Fill | 塗り |
| Stroke | 境界線 |
| Shadow | シャドウ |
| Background | 背景 |
| Padding | 余白 |
| Transform | トランスフォーム |
| Blur / Offset | ぼかし / オフセット |
| Add Text / Add Rectangle / Add Ellipse | テキストを追加 / 長方形を追加 / 楕円形を追加 |
| テンプレート名 | Lower Third=ローワーサード / Centered Title=センタータイトル / Caption Box=キャプションボックス / End Card=エンドカード |

## キャプション

| 英語 | 日本語 |
|---|---|
| Add Caption | キャプションを追加 |
| Import SRT/VTT | SRT/VTTを読み込み |
| Export SRT / Export VTT | SRTを書き出し / VTTを書き出し |
| Show captions (burn-in preview) | キャプションを表示(焼き込みプレビュー) |
| Style | スタイル |
| Position | 位置 |
| Bottom / Top | 下 / 上 |
| Edge | 縁取り |
| None / Shadow / Outline | なし / シャドウ / アウトライン |
| Background Opacity | 背景の不透明度 |
| Auto Transcribe Sequence | シーケンスを自動文字起こし |
| (無効時ツールチップ) | 音声認識には文字起こしバックエンドが必要です。このビルドには含まれていません |

## オーディオ

| 英語 | 日本語 |
|---|---|
| Master | マスター |
| Fader | フェーダー |
| Mute / Solo | ミュート / ソロ |
| Dialogue / Music / SFX / Ambience | 会話 / ミュージック / 効果音 / アンビエンス |
| Loudness | ラウドネス |
| Auto-Match | 自動一致 |
| Repair | 修復 |
| Reduce Noise | ノイズを軽減 |
| Reduce Reverb | リバーブを軽減 |
| Enhance Speech | 会話を強調 |
| Ducking | ダッキング |
| Generate Keyframes | キーフレームを生成 |
| Clip Volume | クリップボリューム |

## プロジェクトパネル

| 英語 | 日本語 |
|---|---|
| Search | 検索 |
| List View / Icon View | リスト表示 / アイコン表示 |
| New Bin | 新規ビン |
| New Item | 新規項目 |
| Sequence | シーケンス |
| Adjustment Layer | 調整レイヤー |
| Import | 読み込み |
| Name / Duration / FPS / Type / Codec | 名前 / デュレーション / fps / タイプ / コーデック |
| Open in Source Monitor | ソースモニターで開く |
| Reveal | 表示 |
| Proxy | プロキシ |
| Toggle Proxy | プロキシの切り替え |
| Restore | 復元 |
| items | 項目 |
| メディアタイプ | video=ビデオ / audio=オーディオ / image=静止画 / sequence=シーケンス / graphic=グラフィック / adjustment=調整レイヤー |

## エフェクト / トランジション名

エフェクト定義の表示名は **`src/engine/effects.ts` 側で日本語化済み**(`def.name`、`param.name`)。パネル側で英語名をハードコードしないこと。
グループ名も `def.group` から取得する。

トランジション名(パネル側で持っている場合はこの訳語):

cross-dissolve=クロスディゾルブ / dip-to-black=暗転 / dip-to-white=明転 / wipe=ワイプ / slide=スライド / push=プッシュ / zoom=ズーム / iris=アイリス / blur-dissolve=ブラーディゾルブ / constant-gain=コンスタントゲイン / constant-power=コンスタントパワー / exponential-fade=指数フェード

見出し: Video Effects=ビデオエフェクト / Audio Effects=オーディオエフェクト / Video Transitions=ビデオトランジション / Audio Transitions=オーディオトランジション

## 書き出し(Export)

| 英語 | 日本語 |
|---|---|
| Export | 書き出し |
| Settings | 設定 |
| File Name | ファイル名 |
| Location | 保存先 |
| Browser Downloads | ブラウザーのダウンロード |
| Preset | プリセット |
| Format | 形式 |
| Frame Size | フレームサイズ |
| Lock aspect | 縦横比を固定 |
| Frame Rate | フレームレート |
| Bitrate | ビットレート |
| More | 詳細 |
| Export audio | オーディオを書き出す |
| Burn captions into video | キャプションを映像に焼き込む |
| Also export sidecar SRT file | SRTファイルも別途書き出す |
| Range | 範囲 |
| Entire Sequence | シーケンス全体 |
| In to Out | インからアウト |
| Source / Output / Duration | ソース / 出力 / デュレーション |
| Estimated size | 推定ファイルサイズ |
| Cancel / Done / Export Another | キャンセル / 完了 / 続けて書き出す |
| Export complete | 書き出しが完了しました |
| Saved to Downloads | ダウンロードフォルダーに保存しました |
| Rendering & encoding | レンダリング/エンコード中 |
| Mixing audio | オーディオをミックス中 |
| Finalizing | 最終処理中 |
| Elapsed / Remaining | 経過 / 残り |
| プリセット名 | Match Source=ソースに合わせる / YouTube 1080p Full HD=YouTube 1080p フルHD / Web 720p=Web 720p / Draft 480p=ドラフト 480p / Audio Only WAV=オーディオのみ(WAV) / PNG Sequence=PNG連番 |
| 形式名 | H.264 (.mp4) / WebM VP9 (.webm) / WAVオーディオ (.wav) / PNG静止画 (.png) / PNG連番 (.zip) / SRTキャプション (.srt) / VTTキャプション (.vtt) / プロジェクト (.json) |
| WebCodecs 警告 | 動画の書き出しには WebCodecs 対応ブラウザー(Chrome / Edge)が必要です |

## ダイアログ / ホーム画面

| 英語 | 日本語 |
|---|---|
| OK / Cancel / Apply / Close | OK / キャンセル / 適用 / 閉じる |
| Speed/Duration | 速度・デュレーション |
| Reverse Speed | 逆再生 |
| Ripple Edit, Shifting Trailing Clips | 後続のクリップをリップル |
| Freeze Frame | フレーム保持 |
| New Sequence | 新規シーケンス |
| Sequence Name | シーケンス名 |
| Preset | プリセット |
| Width / Height | 幅 / 高さ |
| Auto Save | 自動保存 |
| Interval | 間隔 |
| Recent Projects | 最近使用したプロジェクト |
| New Project | 新規プロジェクト |
| Restore Demo Project | デモプロジェクトを復元 |
| Current | 現在開いています |
| 免責表記 | 操作体系を研究した独自実装です。Adobe社およびAdobe Premiere Proとは関係ありません。 |

## ヒストリー

`mutate()` のラベルは英語のまま保持し、**ヒストリーパネル内で日本語に変換して表示**する(変換表を持つ)。主要ラベル:

Move=移動 / Trim=トリミング / Ripple Trim=リップルトリミング / Rolling Edit=ローリング編集 / Slip=スリップ / Slide=スライド / Razor=カット / Delete=削除 / Ripple Delete=リップル削除 / Lift=リフト / Extract=抽出 / Close Gap=間隔を詰める / Duplicate=複製 / Paste=ペースト / Insert=インサート / Overwrite=上書き / Speed/Duration=速度・デュレーション / Rate Stretch=レート調整 / Enable/Disable=有効・無効 / Modify Clip=クリップを変更 / Link=リンク / Unlink=リンク解除 / Group=グループ化 / Ungroup=グループ解除 / Nest=ネスト / Add Clip=クリップを追加 / Add Track=トラックを追加 / Delete Track=トラックを削除 / Modify Track=トラックを変更 / Add Marker=マーカーを追加 / Edit Marker=マーカーを編集 / Clear Marker=マーカーを消去 / Apply Transition=トランジションを適用 / Remove Transition=トランジションを削除 / Modify Transition=トランジションを変更 / Set Property=プロパティを設定 / Toggle Animation=アニメーションの切り替え / Add Keyframe=キーフレームを追加 / Remove Keyframe=キーフレームを削除 / Move Keyframe=キーフレームを移動 / Keyframe Interpolation=キーフレーム補間 / Remove Effect=エフェクトを削除 / Toggle Effect=エフェクトの切り替え / Reorder Effects=エフェクトの並べ替え / Add Mask=マスクを追加 / Remove Mask=マスクを削除 / Modify Mask=マスクを変更 / New Text=新規テキスト / Add Text Layer=テキストレイヤーを追加 / Edit Text=テキストを編集 / Delete Text Layer=テキストレイヤーを削除 / Add Caption=キャプションを追加 / Edit Caption=キャプションを編集 / Delete Caption=キャプションを削除 / Caption Style=キャプションスタイル / Toggle Captions=キャプションの表示切り替え / Import Captions=キャプションを読み込み / Import Media=メディアを読み込み / New Bin=新規ビン / Rename=名前を変更 / Rename Bin=ビン名を変更 / Delete=削除 / Delete Bin=ビンを削除 / Move to Bin=ビンへ移動 / New Sequence=新規シーケンス / Rename Project=プロジェクト名を変更 / Ducking=ダッキング / Apply Template=テンプレートを適用 / Reorder Layers=レイヤーの並べ替え / Add Tracks=トラックを追加 / Delete Tracks=トラックを削除 / Apply <エフェクト名>=<エフェクト名>を適用

変換表に無いラベルはそのまま表示する(フォールバック)。
