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

interface LarkBatchCreateRecordsResponse {
  code: number;
  msg: string;
  data?: {
    records: Array<{
      record_id: string;
      fields: Record<string, unknown>;
    }>;
  };
}

export interface BatchCreateResult {
  successCount: number;
  failedCount: number;
  recordIds: string[];
  errors: Array<{ index: number; error: string }>;
}

interface LarkFieldListResponse {
  code: number;
  msg: string;
  data?: {
    items: Array<{
      field_id: string;
      field_name: string;
      type: number;
    }>;
  };
}

interface LarkCreateFieldResponse {
  code: number;
  msg: string;
  data?: {
    field: {
      field_id: string;
      field_name: string;
      type: number;
    };
  };
}

/**
 * フィールド名を正規化（全角→半角の変換）
 * 括弧、コロン、その他記号を統一
 */
export function normalizeFieldName(name: string): string {
  return name
    // 全角括弧→半角
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    // 全角コロン→半角
    .replace(/：/g, ':')
    // 全角スペース→半角
    .replace(/　/g, ' ')
    // 連続スペースを1つに
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 既存フィールド名から正規化名→実際のフィールド名のマッピングを作成
 */
export function createFieldNameMapping(
  existingFields: Array<{ field_name: string }>
): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const field of existingFields) {
    const normalized = normalizeFieldName(field.field_name);
    // 正規化名→実際のフィールド名
    mapping.set(normalized, field.field_name);
  }
  return mapping;
}

/**
 * JSONフィールドを既存フィールド名にマッピング
 */
export function mapFieldsToExisting(
  fields: Record<string, unknown>,
  fieldMapping: Map<string, string>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = normalizeFieldName(key);
    // 正規化名でマッチする既存フィールドがあればそちらを使用
    const actualFieldName = fieldMapping.get(normalizedKey) || key;
    mapped[actualFieldName] = value;
  }
  return mapped;
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
export function inferFieldType(value: unknown): number {
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
 * テーブルのフィールド一覧を取得
 */
export async function getTableFields(
  token: string,
  appToken: string,
  tableId: string
): Promise<Array<{ field_id: string; field_name: string; type: number }>> {
  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  const data: LarkFieldListResponse = await res.json();

  if (data.code !== 0 || !data.data?.items) {
    console.error('Failed to get fields:', {
      code: data.code,
      msg: data.msg,
      httpStatus: res.status,
    });
    throw new Error(`Failed to get table fields: ${data.msg} (code: ${data.code})`);
  }

  return data.data.items;
}

/**
 * 新規フィールドを作成
 */
export async function createField(
  token: string,
  appToken: string,
  tableId: string,
  fieldName: string,
  fieldType: number
): Promise<string> {
  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        field_name: fieldName,
        type: fieldType,
      }),
    }
  );

  const data: LarkCreateFieldResponse = await res.json();

  if (data.code !== 0 || !data.data?.field.field_id) {
    console.error('Failed to create field:', {
      code: data.code,
      msg: data.msg,
      httpStatus: res.status,
      fieldName,
      fieldType,
    });
    throw new Error(`Failed to create field "${fieldName}": ${data.msg} (code: ${data.code})`);
  }

  return data.data.field.field_id;
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
    console.error('Lark API Error:', {
      code: data.code,
      msg: data.msg,
      httpStatus: res.status,
      response: data,
    });
    throw new Error(`Failed to add record: ${data.msg} (code: ${data.code})`);
  }

  return data.data.record.record_id;
}

/**
 * レコードのフィールド値を処理（配列やオブジェクトはJSON文字列に）
 * オプションでフィールド名マッピングを適用
 */
function processFieldValues(
  fields: Record<string, unknown>,
  fieldMapping?: Map<string, string>
): Record<string, unknown> {
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    // マッピングがあれば正規化名でマッチする既存フィールド名を使用
    let actualKey = key;
    if (fieldMapping) {
      const normalizedKey = normalizeFieldName(key);
      actualKey = fieldMapping.get(normalizedKey) || key;
    }

    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      processed[actualKey] = JSON.stringify(value);
    } else if (value === null || value === undefined) {
      processed[actualKey] = '';
    } else {
      processed[actualKey] = value;
    }
  }
  return processed;
}

/**
 * 複数レコードをバッチで追加（最大500レコード/リクエスト）
 * fieldMappingを指定すると、JSONフィールド名を既存フィールド名にマッピング
 */
export async function batchCreateRecords(
  token: string,
  appToken: string,
  tableId: string,
  records: Array<Record<string, unknown>>,
  fieldMapping?: Map<string, string>
): Promise<BatchCreateResult> {
  const BATCH_SIZE = 500;
  const result: BatchCreateResult = {
    successCount: 0,
    failedCount: 0,
    recordIds: [],
    errors: [],
  };

  // Split records into batches of 500
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchRecords = batch.map((fields) => ({
      fields: processFieldValues(fields, fieldMapping),
    }));

    try {
      const res = await fetch(
        `${LARK_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ records: batchRecords }),
        }
      );

      const data: LarkBatchCreateRecordsResponse = await res.json();

      if (data.code !== 0) {
        console.error('Batch create error:', {
          code: data.code,
          msg: data.msg,
          batchStart: i,
          batchSize: batch.length,
        });

        // Mark all records in this batch as failed
        for (let j = 0; j < batch.length; j++) {
          result.errors.push({
            index: i + j,
            error: data.msg || 'Unknown error',
          });
        }
        result.failedCount += batch.length;
      } else if (data.data?.records) {
        result.successCount += data.data.records.length;
        result.recordIds.push(...data.data.records.map((r) => r.record_id));
      }
    } catch (error) {
      console.error('Batch create exception:', error);
      // Mark all records in this batch as failed
      for (let j = 0; j < batch.length; j++) {
        result.errors.push({
          index: i + j,
          error: error instanceof Error ? error.message : 'Network error',
        });
      }
      result.failedCount += batch.length;
    }
  }

  return result;
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
