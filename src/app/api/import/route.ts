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
  notifyImportError,
  notifyGeneralError,
} from '@/lib/lark';

// Lark Base フィールド型のマッピング
type LarkFieldType = 'text' | 'number' | 'checkbox' | 'url' | 'datetime' | 'phone';

interface FieldTypeMapping {
  [fieldName: string]: LarkFieldType;
}

// フロントエンドの型名からLark APIの型番号に変換
function larkTypeToNumber(type: LarkFieldType): number {
  switch (type) {
    case 'text': return 1;
    case 'number': return 2;
    case 'checkbox': return 7;
    case 'url': return 15;
    case 'datetime': return 5;
    case 'phone': return 13;
    default: return 1;
  }
}

interface ImportRequest {
  records: Array<Record<string, unknown>>;
  appToken: string;
  tableId: string;
  fieldTypes?: FieldTypeMapping;
}

export async function POST(request: NextRequest) {
  // エラー通知用にレコードを保存
  let savedRecords: Array<Record<string, unknown>> | undefined;

  try {
    const body: ImportRequest = await request.json();
    const { records, fieldTypes } = body;
    savedRecords = records; // エラー通知用に保存
    // 環境変数の改行をトリム
    const appToken = (body.appToken || '').trim();
    const tableId = (body.tableId || '').trim();

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

    // URL型フィールド（type: 15）のフィールド名を収集
    const urlFieldNames = new Set<string>(
      existingFields.filter((f) => f.type === 15).map((f) => f.field_name)
    );
    if (urlFieldNames.size > 0) {
      console.log('URL type fields detected:', Array.from(urlFieldNames));
    }

    // 数値型フィールド（type: 2）のフィールド名を収集
    const numberFieldNames = new Set<string>(
      existingFields.filter((f) => f.type === 2).map((f) => f.field_name)
    );
    if (numberFieldNames.size > 0) {
      console.log('Number type fields detected:', Array.from(numberFieldNames));
    }

    // 4. 全レコードから一意のフィールド名を収集
    const allFieldNames = new Set<string>();
    const normalizedToIncoming = new Map<string, string>();
    const normalizedToAliases = new Map<string, Set<string>>();
    records.forEach((record) => {
      Object.keys(record).forEach((key) => {
        allFieldNames.add(key);
        const normalizedKey = normalizeFieldName(key);
        if (!normalizedToIncoming.has(normalizedKey)) {
          normalizedToIncoming.set(normalizedKey, key);
        }
        const aliases = normalizedToAliases.get(normalizedKey) ?? new Set<string>();
        aliases.add(key);
        normalizedToAliases.set(normalizedKey, aliases);
      });
    });

    // 5. 不足しているフィールドを自動作成（正規化名で比較し重複作成を防止）
    const missingFields = Array.from(normalizedToIncoming.entries())
      .filter(([normalizedName]) => !existingNormalizedNames.has(normalizedName))
      .map(([, originalName]) => originalName);

    if (missingFields.length > 0) {
      console.log(`Creating ${missingFields.length} missing fields:`, missingFields);

      for (const fieldName of missingFields) {
        // ユーザーが選択した型があればそれを使用、なければ自動推論
        let fieldType: number;
        const normalizedFieldName = normalizeFieldName(fieldName);
        const aliases = normalizedToAliases.get(normalizedFieldName) ?? new Set([fieldName]);
        const selectedTypeEntry = Array.from(aliases)
          .map((alias) => (fieldTypes ? fieldTypes[alias] : undefined))
          .find((value): value is LarkFieldType => value !== undefined);

        if (selectedTypeEntry) {
          fieldType = larkTypeToNumber(selectedTypeEntry);
          console.log(`Using user-selected type for ${fieldName}: ${selectedTypeEntry} -> ${fieldType}`);
        } else {
          // Find first non-null value to infer type
          let fieldValue: unknown = null;
          for (const record of records) {
            for (const alias of aliases) {
              if (record[alias] !== null && record[alias] !== undefined) {
                fieldValue = record[alias];
                break;
              }
            }
            if (fieldValue !== null && fieldValue !== undefined) {
              break;
            }
          }
          fieldType = inferFieldType(fieldValue);
        }

        try {
          await createField(token, appToken, tableId, fieldName, fieldType);
          console.log(`Created field: ${fieldName} (type: ${fieldType})`);
          fieldMapping.set(normalizedFieldName, fieldName);
          existingNormalizedNames.add(normalizedFieldName);
          // 新しく作成されたURL型フィールドもurlFieldNamesに追加
          if (fieldType === 15) {
            urlFieldNames.add(fieldName);
          }
          // 新しく作成された数値型フィールドもnumberFieldNamesに追加
          if (fieldType === 2) {
            numberFieldNames.add(fieldName);
          }
        } catch (error) {
          console.error(`Failed to create field: ${fieldName}`, error);
          throw error;
        }
      }
    }

    // 6. バッチでレコードを追加（フィールド名マッピングと型変換を適用）
    const result: BatchCreateResult = await batchCreateRecords(
      token,
      appToken,
      tableId,
      records,
      fieldMapping,
      urlFieldNames,
      numberFieldNames
    );

    // エラーがある場合は詳細を表示し、通知を送信
    if (result.failedCount > 0 && result.errors.length > 0) {
      console.log('Import completed with errors:', result.errors.slice(0, 5));

      // 通知先が設定されている場合、Larkグループチャットで通知
      const notifyChatId = process.env.NOTIFY_CHAT_ID;
      if (notifyChatId) {
        // 失敗したレコードのインデックスからレコードを取得
        const failedIndices = result.errors.map((e) => e.index);
        const failedRecords = failedIndices.map((idx) => records[idx]).filter(Boolean);
        const errorMessage = result.errors[0]?.error || 'Unknown error';

        // 非同期で通知（レスポンスを遅延させない）
        notifyImportError(token, notifyChatId, errorMessage, failedRecords).catch((err) => {
          console.error('Failed to send notification:', err);
        });
      }
    }

    return NextResponse.json({
      success: result.failedCount === 0,
      message:
        result.failedCount === 0
          ? 'インポートが完了しました'
          : `${result.successCount}件成功、${result.failedCount}件失敗`,
      // エラーの場合もerrorフィールドを設定
      error: result.failedCount > 0 && result.errors.length > 0
        ? result.errors[0].error
        : undefined,
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

    // 通知先が設定されている場合、エラーを通知
    const notifyChatId = process.env.NOTIFY_CHAT_ID;
    if (notifyChatId) {
      // 非同期で通知（レスポンスを遅延させない）
      notifyGeneralError(notifyChatId, message, savedRecords).catch((err) => {
        console.error('Failed to send error notification:', err);
      });
    }

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
