import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantAccessToken,
  getTableFields,
  createField,
  inferFieldType,
  batchCreateRecords,
  BatchCreateResult,
  normalizeFieldName,
  createFieldNameMapping,
} from '@/lib/lark';

interface ImportRequest {
  records: Array<Record<string, unknown>>;
  appToken: string;
  tableId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const { records, appToken, tableId } = body;

    // バリデーション
    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'レコードデータが無効です' },
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

    // 3. フィールド名マッピングを作成（正規化名→実際のフィールド名）
    const fieldMapping = createFieldNameMapping(existingFields);
    const existingNormalizedNames = new Set(
      existingFields.map((f) => normalizeFieldName(f.field_name))
    );

    // 4. 全レコードから一意のフィールド名を収集
    const allFieldNames = new Set<string>();
    records.forEach((record) => {
      Object.keys(record).forEach((key) => allFieldNames.add(key));
    });

    // 5. 不足しているフィールドを自動作成（正規化名で比較）
    const missingFields = Array.from(allFieldNames).filter((name) => {
      const normalizedName = normalizeFieldName(name);
      return !existingNormalizedNames.has(normalizedName);
    });

    if (missingFields.length > 0) {
      console.log(`Creating ${missingFields.length} missing fields:`, missingFields);

      for (const fieldName of missingFields) {
        // Find first non-null value to infer type
        let fieldValue: unknown = null;
        for (const record of records) {
          if (record[fieldName] !== null && record[fieldName] !== undefined) {
            fieldValue = record[fieldName];
            break;
          }
        }
        const fieldType = inferFieldType(fieldValue);

        try {
          await createField(token, appToken, tableId, fieldName, fieldType);
          console.log(`Created field: ${fieldName} (type: ${fieldType})`);
        } catch (error) {
          console.error(`Failed to create field: ${fieldName}`, error);
          throw error;
        }
      }
    }

    // 6. バッチでレコードを追加（フィールド名マッピングを適用）
    const result: BatchCreateResult = await batchCreateRecords(
      token,
      appToken,
      tableId,
      records,
      fieldMapping
    );

    return NextResponse.json({
      success: result.failedCount === 0,
      message:
        result.failedCount === 0
          ? 'インポートが完了しました'
          : `${result.successCount}件成功、${result.failedCount}件失敗`,
      data: {
        tableId,
        totalRecords: records.length,
        successCount: result.successCount,
        failedCount: result.failedCount,
        recordIds: result.recordIds,
        errors: result.errors,
        fieldsCount: allFieldNames.size,
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
