# Lark Base Importer - Project Context

## Overview
JSONデータを既存のLark Baseテーブルにインポートするwebアプリケーション。

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **API**: Lark Open API (Bitable)
- **AI Ops**: Miyabi MCP Bundle

## Project Structure
```
src/
├── app/
│   ├── api/import/route.ts    # POST /api/import エンドポイント
│   ├── page.tsx               # メインページ（3ステップウィザード）
│   ├── layout.tsx             # ルートレイアウト
│   └── globals.css            # Tailwind CSS
├── components/
│   ├── JsonUploader.tsx       # JSON入力（ファイル/テキスト）
│   └── FieldPreview.tsx       # フィールドプレビュー
└── lib/
    └── lark.ts                # Lark API クライアント
```

## Key Features
1. **JSON入力**: ファイルアップロード or テキスト直接入力
2. **URL解析**: Lark Base URLからapp_token/table_idを自動抽出
3. **フィールドプレビュー**: インポート前にデータ確認
4. **既存テーブルへの追加**: 新規作成ではなく既存テーブルにレコード追加

## Environment Variables
```
LARK_APP_ID=xxx          # Lark App ID
LARK_APP_SECRET=xxx      # Lark App Secret
```

## Commands
```bash
npm run dev      # 開発サーバー起動 (localhost:3000)
npm run build    # プロダクションビルド
npm run start    # プロダクションサーバー起動
npm run lint     # ESLint実行
```

## Miyabi Agent Guidelines

### Issue作成時のルール
- タイトルは Conventional Commits 形式: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- タスクはチェックボックス形式で分解
- 成功条件を明記
- `🤖agent-execute` ラベルで自動実行

### コード生成時のルール
- 既存のコンポーネントパターンに従う
- TypeScript strict mode準拠
- Tailwind CSSでスタイリング
- 日本語UIを維持

### テスト
- ビルド成功: `npm run build`
- Lint通過: `npm run lint`

## Repository
- **GitHub**: https://github.com/PLark-droid/lark-base-importer
- **Owner**: PLark-droid
