# Web Video Studio

> This is not a visual recreation of a video editor.
> The timeline, effects, audio mix, captions, playback, and export pipeline are actually running in the browser.

Premiere Pro 互換の操作体系を研究した、ブラウザ上で**本当に動く**ノンリニア映像編集ソフトです。UI は日本語。
ページを開くと完成済みデモプロジェクト **CITY PULSE — Tokyo Night Promo**(45秒)が読み込まれ、Space キーで再生できます。

デモ映像は**画面上に文字を一切含みません**(映像素材に文字を焼き込まない方針)。タイトル・ローワーサード・ロゴはテンプレートとして `03_GRAPHICS` ビンとエッセンシャルグラフィックスの「参照」タブに用意してあり、必要なときにタイムラインへ追加できます。字幕機能も同様に、空の状態から編集・読み込み・焼き込みができます。

## 実行

```bash
npm install
npm run dev   # http://localhost:5173
```

- 自動テスト(操作・レンダリング・音声・書き出しの検証): `http://localhost:5173/?selftest=1`
- 推奨ブラウザ: Chrome / Edge(動画書き出しに WebCodecs を使用)

## 「本物」の要件(仕様 §33)

- 完成映像を隠し動画として再生することは**していません**。Program Monitor は毎フレーム、タイムラインの編集グラフ(クリップ配置・速度・キーフレーム・エフェクト・トランジション・字幕)から Canvas 合成でレンダリングします。
- デモ映像はプロシージャル生成(決定論的な `(素材, 時刻, シード) → ピクセル` 関数)。カットを切る・動かす・色を変えると、再生と書き出しの両方に即時反映されます。
- 音声はブラウザ内で**サンプル単位で合成**され(120BPM の楽曲、環境音、SFX)、波形表示・ミックス・メーター・書き出しすべてが実サンプルを参照します。
- Export は毎フレームを再レンダリングして WebCodecs (H.264/VP9 + AAC/Opus) でエンコードし、mp4-muxer / webm-muxer で実ファイルを生成します。書き出した MP4/WebM はエディタ外で再生できます。

## 主な機能

- 5 ビデオ + 4 オーディオトラック、複数シーケンス、ネスト、縦型ソーシャルカット
- 編集ツール: Selection / Track Select / Ripple / Rolling / Rate Stretch / Razor / Slip / Slide / Hand / Zoom / Type
- Insert / Overwrite、In/Out、Lift / Extract、Close Gap、リンククリップ、グループ、複製
- キーフレームアニメーション(Position / Scale / Rotation / Opacity / Volume / 全エフェクトパラメータ、イージング各種)
- エフェクト: Lumetri 相当カラー(色温度・ティント・露出・コントラスト・彩度ほか、SVG ColorMatrix による GPU 処理)、ブラー、グロー、クロップ、キーイング、ビネット、グレインなど
- トランジション: Cross Dissolve / Dip to Black / White / Wipe / Push / Slide / Zoom / Iris / Blur Dissolve、音声フェード 3 種
- テキスト・グラフィック(複数レイヤー、Program Monitor 上の直接操作・ダブルクリック編集)
- 字幕(編集・スタイル・SRT/VTT 入出力・焼き込み)
- 調整レイヤー、マスク(矩形・楕円、ぼかし・反転)、スローモーション、フリーズフレーム
- オーディオ: クリップ/トラックミキサー、ミュート/ソロ、EQ・コンプ・リバーブ等、実波形表示、レベルメーター
- Undo/Redo(履歴パネル)、IndexedDB 自動保存(リロード後も編集内容が残る)、プロジェクト JSON 入出力
- Export: MP4 / WebM / WAV / PNG / PNG シーケンス(ZIP)/ SRT / VTT / プロジェクトアーカイブ

## 法務(仕様 §35)

- 本プロジェクトは **Adobe とは無関係**の、操作体系の研究・制作検証を目的とした独自実装です。
- Adobe Premiere Pro および Adobe ロゴは Adobe Inc. の商標です。本リポジトリは Adobe のコード・ロゴ・アイコン・スクリーンショット素材を一切含みません。
- デモ素材(映像・音声)はすべてプログラムによる自作生成です。
- 一般公開時は独自名称・独自ロゴを使用し、Adobe 公式製品と誤認される表示を行いません。

## 技術構成

TypeScript / React 19 / zustand / Canvas 2D(+SVG ColorMatrix)/ Web Audio API / WebCodecs / mp4-muxer / webm-muxer / IndexedDB
