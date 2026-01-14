/**
 * Lark Open API Client
 * JSON → Lark Base インポート用
 */

const LARK_API_BASE = 'https://open.larksuite.com/open-apis';

/**
 * Lark Base URLからapp_tokenとtable_idを抽出
 * URL形式:
 * - https://xxx.larksuite.com/base/{app_token}?table={table_id}
 * - https://xxx.feishu.cn/base/{app_token}?table={table_id}
 */
export interface LarkBaseUrlInfo {
  appToken: string;
  tableId: string;
}

export function parseLarkBaseUrl(url: string): LarkBaseUrlInfo | null {
  try {
    const parsed = new URL(url);

    // パスからapp_tokenを抽出
    const pathMatch = parsed.pathname.match(/\/base\/([^/?]+)/);
    if (!pathMatch) {
      return null;
    }
    const appToken = pathMatch[1];

    // クエリパラメータからtable_idを抽出
    const tableId = parsed.searchParams.get('table');
    if (!tableId) {
      return null;
    }

    return { appToken, tableId };
  } catch {
    return null;
  }
}

interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface LarkBaseField {
  field_name: string;
  type: number; // 1: Text, 2: Number, 3: SingleSelect, etc.
}

interface LarkCreateTableResponse {
  code: number;
  msg: string;
  data?: {
    table_id: string;
  };
}

interface LarkAddRecordResponse {
  code: number;
  msg: string;
  data?: {
    record: {
      record_id: string;
    };
  };
}

/**
 * Tenant Access Token を取得
 */
export async function getTenantAccessToken(): Promise<string> {
  const res = await fetch(`${LARK_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  });

  const data: LarkTokenResponse = await res.json();

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get token: ${data.msg}`);
  }

  return data.tenant_access_token;
}

/**
 * JSONキーからLark Baseのフィールドタイプを推測
 */
function inferFieldType(value: unknown): number {
  if (value === null || value === undefined) {
    return 1; // Text
  }
  if (typeof value === 'number') {
    return 2; // Number
  }
  if (typeof value === 'boolean') {
    return 7; // Checkbox
  }
  if (Array.isArray(value)) {
    return 1; // Text (JSON string)
  }
  if (typeof value === 'object') {
    return 1; // Text (JSON string)
  }
  // URL check
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return 15; // URL
  }
  // Email check
  if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 1; // Text (Lark doesn't have email type)
  }
  return 1; // Text (default)
}

/**
 * JSONオブジェクトからフィールド定義を生成
 */
export function generateFieldsFromJson(jsonData: Record<string, unknown>): LarkBaseField[] {
  return Object.entries(jsonData).map(([key, value]) => ({
    field_name: key,
    type: inferFieldType(value),
  }));
}

/**
 * Lark Base にテーブルを作成
 */
export async function createTable(
  token: string,
  appToken: string,
  tableName: string,
  fields: LarkBaseField[]
): Promise<string> {
  const res = await fetch(`${LARK_API_BASE}/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: tableName,
        default_view_name: 'Grid View',
        fields: fields,
      },
    }),
  });

  const data: LarkCreateTableResponse = await res.json();

  if (data.code !== 0 || !data.data?.table_id) {
    throw new Error(`Failed to create table: ${data.msg}`);
  }

  return data.data.table_id;
}

/**
 * レコードを追加
 */
export async function addRecord(
  token: string,
  appToken: string,
  tableId: string,
  fields: Record<string, unknown>
): Promise<string> {
  // 値の変換（配列やオブジェクトはJSON文字列に）
  const processedFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      processedFields[key] = JSON.stringify(value);
    } else if (value === null || value === undefined) {
      processedFields[key] = '';
    } else {
      processedFields[key] = value;
    }
  }

  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        fields: processedFields,
      }),
    }
  );

  const data: LarkAddRecordResponse = await res.json();

  if (data.code !== 0 || !data.data?.record.record_id) {
    throw new Error(`Failed to add record: ${data.msg}`);
  }

  return data.data.record.record_id;
}

/**
 * Base App一覧を取得（テスト用）
 */
export async function listBases(token: string): Promise<unknown> {
  const res = await fetch(`${LARK_API_BASE}/bitable/v1/apps`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return res.json();
}
