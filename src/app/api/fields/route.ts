import { NextRequest, NextResponse } from 'next/server';
import { getTenantAccessToken, getTableFields, normalizeFieldName } from '@/lib/lark';

export interface ExistingField {
  field_id: string;
  field_name: string;
  normalized_name: string;
  type: number;
}

interface FieldsRequest {
  appToken: string;
  tableId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: FieldsRequest = await request.json();
    // 環境変数の改行をトリム
    const appToken = (body.appToken || '').trim();
    const tableId = (body.tableId || '').trim();

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

    if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
      return NextResponse.json(
        { error: 'Lark API認証情報が設定されていません' },
        { status: 500 }
      );
    }

    const token = await getTenantAccessToken();
    const fields = await getTableFields(token, appToken, tableId);

    const existingFields: ExistingField[] = fields.map((f) => ({
      field_id: f.field_id,
      field_name: f.field_name,
      normalized_name: normalizeFieldName(f.field_name),
      type: f.type,
    }));

    return NextResponse.json({
      success: true,
      data: {
        fields: existingFields,
      },
    });
  } catch (error) {
    console.error('Fields fetch error:', error);
    const message =
      error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
