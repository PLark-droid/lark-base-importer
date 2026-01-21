import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantAccessToken,
  addRecord,
  getTableFields,
  createField,
  inferFieldType,
} from '@/lib/lark';

interface ImportRequest {
  jsonData: Record<string, unknown>;
  appToken: string;
  tableId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const { jsonData, appToken, tableId } = body;

    // バリデーション
    if (!jsonData || typeof jsonData !== 'object') {
      return NextResponse.json(
        { error: 'JSONデータが無効です' },
        { status: 400 }
      );
    }

    if (!appToken) {
      return NextResponse.json(
        { error: 'App Tokenを指定してください' },
        { status: 400 }
      );
    }

    if (!tableId) {
      return NextResponse.json(
        { error: 'Table IDを指定してください' },
        { status: 400 }
      );
    }

    // 環境変数チェック
    if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
      return NextResponse.json(
        { error: 'Lark API認証情報が設定されていません' },
        { status: 500 }
      );
    }

    // 1. トークン取得
    const token = await getTenantAccessToken();

    // 2. 既存テーブルのフィールド一覧を取得
    const existingFields = await getTableFields(token, appToken, tableId);
    const existingFieldNames = new Set(existingFields.map(f => f.field_name));

    // 3. 不足しているフィールドを自動作成
    const jsonFieldNames = Object.keys(jsonData);
    const missingFields = jsonFieldNames.filter(name => !existingFieldNames.has(name));

    if (missingFields.length > 0) {
      console.log(`Creating ${missingFields.length} missing fields:`, missingFields);

      for (const fieldName of missingFields) {
        const fieldValue = jsonData[fieldName];
        const fieldType = inferFieldType(fieldValue);

        try {
          await createField(token, appToken, tableId, fieldName, fieldType);
          console.log(`✓ Created field: ${fieldName} (type: ${fieldType})`);
        } catch (error) {
          console.error(`✗ Failed to create field: ${fieldName}`, error);
          throw error;
        }
      }
    }

    // 4. 既存テーブルにレコード追加
    const recordId = await addRecord(token, appToken, tableId, jsonData);

    return NextResponse.json({
      success: true,
      message: 'インポートが完了しました',
      data: {
        tableId,
        recordId,
        fieldsCount: Object.keys(jsonData).length,
        createdFieldsCount: missingFields.length,
      },
    });
  } catch (error) {
    console.error('Import error:', error);

    const message =
      error instanceof Error ? error.message : '不明なエラーが発生しました';

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
