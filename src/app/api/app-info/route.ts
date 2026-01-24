import { NextRequest, NextResponse } from 'next/server';
import { getTenantAccessToken, getAppInfo, getTableInfo } from '@/lib/lark';

interface AppInfoRequest {
  appToken: string;
  tableId: string;
}

export async function POST(request: NextRequest) {
  try {
    // リクエストボディをテキストとして読み取り
    const rawBody = await request.text();
    console.log('Raw request body:', rawBody);

    // JSONとしてパース
    let body: AppInfoRequest;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Body:', rawBody);
      return NextResponse.json(
        { error: `Invalid JSON: ${rawBody.substring(0, 100)}`, success: false },
        { status: 400 }
      );
    }

    // 環境変数の改行をトリム
    const appToken = (body.appToken || '').trim();
    const tableId = (body.tableId || '').trim();

    if (!appToken || !tableId) {
      return NextResponse.json(
        { error: 'appTokenとtableIdが必要です', success: false },
        { status: 400 }
      );
    }

    // 環境変数チェック
    if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
      return NextResponse.json(
        { error: 'Lark API認証情報が設定されていません', success: false },
        { status: 500 }
      );
    }

    // トークン取得
    const token = await getTenantAccessToken();

    // App情報とテーブル情報を並列で取得
    const [appInfo, tableInfo] = await Promise.all([
      getAppInfo(token, appToken),
      getTableInfo(token, appToken, tableId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        appName: appInfo.name,
        tableName: tableInfo.name,
      },
    });
  } catch (error) {
    console.error('App info error:', error);

    const message =
      error instanceof Error ? error.message : '不明なエラーが発生しました';

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
