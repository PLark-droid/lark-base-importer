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
    // Unicode正規化（NFKC: 互換分解→正準合成。全角英数→半角、異体字統一等）
    .normalize('NFKC')
    // ゼロ幅文字・BOM・不可視文字を除去
    .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD]/g, '')
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
 * フィールドバリデーション結果の型定義
 */
export interface FieldValidationResult {
  // 完全一致（既存フィールドにそのまま格納）
  exactMatches: Array<{
    jsonField: string;
    existingField: string;
  }>;
  // 類似一致（正規化後に一致、確認が必要）
  similarMatches: Array<{
    jsonField: string;
    existingField: string;
    normalizedName: string;
  }>;
  // 新規フィールド（既存にない、追加承認が必要）
  newFields: string[];
}

/**
 * JSONフィールドと既存フィールドを比較してバリデーション結果を返す
 */
export function validateFieldsAgainstExisting(
  jsonFields: string[],
  existingFields: Array<{ field_name: string; normalized_name: string }>
): FieldValidationResult {
  const result: FieldValidationResult = {
    exactMatches: [],
    similarMatches: [],
    newFields: [],
  };

  // 既存フィールドのマップを作成
  const exactMap = new Map<string, string>();
  const normalizedMap = new Map<string, string>();

  for (const field of existingFields) {
    const normalizedExisting = normalizeFieldName(field.field_name);
    exactMap.set(field.field_name, field.field_name);
    normalizedMap.set(field.normalized_name || normalizedExisting, field.field_name);
  }

  for (const jsonField of jsonFields) {
    const normalizedJsonField = normalizeFieldName(jsonField);
    const normalizedMatchedField = normalizedMap.get(normalizedJsonField);

    // 正規化名で比較した上で、元文字列も同一なら完全一致
    if (normalizedMatchedField && exactMap.has(jsonField) && normalizedMatchedField === jsonField) {
      result.exactMatches.push({
        jsonField,
        existingField: jsonField,
      });
    }
    // 正規化後に一致（類似）チェック
    else if (normalizedMatchedField) {
      result.similarMatches.push({
        jsonField,
        existingField: normalizedMatchedField,
        normalizedName: normalizedJsonField,
      });
    }
    // 新規フィールド
    else {
      result.newFields.push(jsonField);
    }
  }

  return result;
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
 * 安全にJSONをパースする（非JSON応答時にわかりやすいエラーを返す）
 */
async function safeJsonParse<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.error(`${context}: Failed to parse JSON response`, {
      httpStatus: res.status,
      responsePreview: text.substring(0, 200),
    });
    throw new Error(`${context}: Invalid JSON response (HTTP ${res.status}). Preview: ${text.substring(0, 100)}`);
  }
}

/**
 * Tenant Access Token を取得
 */
export async function getTenantAccessToken(): Promise<string> {
  // 環境変数をトリムして使用
  const appId = (process.env.LARK_APP_ID || '').trim();
  const appSecret = (process.env.LARK_APP_SECRET || '').trim();

  if (!appId || !appSecret) {
    throw new Error('LARK_APP_ID or LARK_APP_SECRET is not configured');
  }

  const res = await fetch(`${LARK_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const data = await safeJsonParse<LarkTokenResponse>(res, 'getTenantAccessToken');

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
  // appTokenとtableIdをトリム
  const cleanAppToken = appToken.trim();
  const cleanTableId = tableId.trim();

  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${cleanAppToken}/tables/${cleanTableId}/fields`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  const data = await safeJsonParse<LarkFieldListResponse>(res, 'getTableFields');

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
  // appTokenとtableIdをトリム
  const cleanAppToken = appToken.trim();
  const cleanTableId = tableId.trim();

  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${cleanAppToken}/tables/${cleanTableId}/fields`,
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

  const data = await safeJsonParse<LarkCreateFieldResponse>(res, 'createField');

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
  // 空の値はスキップ（URL型フィールドなどのエラー防止）
  const processedFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    // 空の値はスキップ
    if (value === null || value === undefined || value === '') {
      continue;
    }

    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      processedFields[key] = JSON.stringify(value);
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
 * URLが有効かどうかを検証
 */
function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    // http または https プロトコルのみ許可
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * レコードのフィールド値を処理（配列やオブジェクトはJSON文字列に）
 * オプションでフィールド名マッピングを適用
 * 空の値（null, undefined, 空文字列）はスキップ（URL型フィールドなどのエラー防止）
 * URL型フィールドの無効な値もスキップ
 * 数値型フィールド以外は文字列に変換（TextFieldConvFail防止）
 */
function processFieldValues(
  fields: Record<string, unknown>,
  fieldMapping?: Map<string, string>,
  urlFieldNames?: Set<string>,
  numberFieldNames?: Set<string>
): Record<string, unknown> {
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    // マッピングがあれば正規化名でマッチする既存フィールド名を使用
    let actualKey = key;
    if (fieldMapping) {
      const normalizedKey = normalizeFieldName(key);
      actualKey = fieldMapping.get(normalizedKey) || key;
    }

    // 空の値はスキップ（URL型フィールドに空文字を送るとエラーになるため）
    if (value === null || value === undefined || value === '') {
      continue;
    }

    // URL型フィールドの場合、Lark APIの特殊な形式に変換
    // Lark Base APIのURL型フィールドは { link: "url", text: "表示テキスト" } 形式が必要
    if (urlFieldNames && urlFieldNames.has(actualKey)) {
      if (!isValidUrl(value)) {
        console.log(`Skipping invalid URL value for field "${actualKey}": ${value}`);
        continue;
      }
      // 有効なURLの場合、Lark APIの形式に変換
      processed[actualKey] = {
        link: String(value),
        text: String(value),
      };
      continue;
    }

    // 数値型フィールドの場合、数値として送信
    if (numberFieldNames && numberFieldNames.has(actualKey)) {
      if (typeof value === 'number') {
        processed[actualKey] = value;
      } else if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
        processed[actualKey] = Number(value);
      }
      // 数値に変換できない場合はスキップ
      continue;
    }

    // それ以外のフィールドは文字列に変換（TextFieldConvFail防止）
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      processed[actualKey] = JSON.stringify(value);
    } else {
      // 数値やbooleanも文字列に変換
      processed[actualKey] = String(value);
    }
  }
  return processed;
}

/**
 * 複数レコードをバッチで追加（最大500レコード/リクエスト）
 * fieldMappingを指定すると、JSONフィールド名を既存フィールド名にマッピング
 * urlFieldNamesを指定すると、URL型フィールドの無効な値をスキップ
 * numberFieldNamesを指定すると、数値型フィールドは数値として送信
 */
export async function batchCreateRecords(
  token: string,
  appToken: string,
  tableId: string,
  records: Array<Record<string, unknown>>,
  fieldMapping?: Map<string, string>,
  urlFieldNames?: Set<string>,
  numberFieldNames?: Set<string>
): Promise<BatchCreateResult> {
  // appTokenとtableIdをトリム
  const cleanAppToken = appToken.trim();
  const cleanTableId = tableId.trim();

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
      fields: processFieldValues(fields, fieldMapping, urlFieldNames, numberFieldNames),
    }));

    try {
      const res = await fetch(
        `${LARK_API_BASE}/bitable/v1/apps/${cleanAppToken}/tables/${cleanTableId}/records/batch_create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ records: batchRecords }),
        }
      );

      const data = await safeJsonParse<LarkBatchCreateRecordsResponse>(res, 'batchCreateRecords');

      if (data.code !== 0) {
        // Lark API エラーの詳細をログ出力
        console.error('Batch create error:', {
          code: data.code,
          msg: data.msg,
          batchStart: i,
          batchSize: batch.length,
          httpStatus: res.status,
          // 最初のレコードのフィールド名をログ（デバッグ用）
          firstRecordFields: batch.length > 0 ? Object.keys(batch[0]) : [],
        });

        // 具体的なエラーメッセージを生成
        const errorMessage = `Lark API Error: ${data.msg} (code: ${data.code})`;

        // Mark all records in this batch as failed
        for (let j = 0; j < batch.length; j++) {
          result.errors.push({
            index: i + j,
            error: errorMessage,
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

/**
 * Base Appの情報を取得
 */
export interface AppInfo {
  appToken: string;
  name: string;
  revision: number;
}

export async function getAppInfo(
  token: string,
  appToken: string
): Promise<AppInfo> {
  // appTokenをトリム
  const cleanAppToken = appToken.trim();

  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${cleanAppToken}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  interface AppInfoResponse {
    code: number;
    msg: string;
    data?: {
      app: {
        app_token: string;
        name: string;
        revision: number;
      };
    };
  }

  const data = await safeJsonParse<AppInfoResponse>(res, 'getAppInfo');

  if (data.code !== 0 || !data.data?.app) {
    console.error('Failed to get app info:', {
      code: data.code,
      msg: data.msg,
      httpStatus: res.status,
    });
    throw new Error(`Failed to get app info: ${data.msg} (code: ${data.code})`);
  }

  return {
    appToken: data.data.app.app_token,
    name: data.data.app.name,
    revision: data.data.app.revision,
  };
}

/**
 * テーブルの情報を取得
 */
export interface TableInfo {
  tableId: string;
  name: string;
  revision: number;
}

export async function getTableInfo(
  token: string,
  appToken: string,
  tableId: string
): Promise<TableInfo> {
  // appTokenとtableIdをトリム
  const cleanAppToken = appToken.trim();
  const cleanTableId = tableId.trim();

  // Lark APIではテーブル一覧から取得する（個別のテーブル取得APIはない）
  const res = await fetch(
    `${LARK_API_BASE}/bitable/v1/apps/${cleanAppToken}/tables`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  interface TableListResponse {
    code: number;
    msg: string;
    data?: {
      items: Array<{
        table_id: string;
        name: string;
        revision: number;
      }>;
    };
  }

  const data = await safeJsonParse<TableListResponse>(res, 'getTableInfo');

  if (data.code !== 0 || !data.data?.items) {
    console.error('Failed to get table list:', {
      code: data.code,
      msg: data.msg,
      httpStatus: res.status,
    });
    throw new Error(`Failed to get table list: ${data.msg} (code: ${data.code})`);
  }

  // 指定されたtableIdを持つテーブルを探す
  const table = data.data.items.find((t) => t.table_id === cleanTableId);
  if (!table) {
    throw new Error(`Table not found: ${cleanTableId}`);
  }

  return {
    tableId: table.table_id,
    name: table.name,
    revision: table.revision,
  };
}

/**
 * グループチャットにメッセージを送信
 * @param chatId グループチャットID（oc_xxxxx形式）
 */
export async function sendMessageToChat(
  token: string,
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    // chatIdをトリム
    const cleanChatId = chatId.trim();

    const res = await fetch(
      `${LARK_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: cleanChatId,
          msg_type: 'text',
          content: JSON.stringify({ text: message }),
        }),
      }
    );

    interface SendMessageResponse {
      code: number;
      msg: string;
    }
    const data = await safeJsonParse<SendMessageResponse>(res, 'sendMessageToChat');
    if (data.code !== 0) {
      console.error('Failed to send message to chat:', data.msg, data.code);
      return false;
    }

    console.log('Message sent successfully to chat:', cleanChatId);
    return true;
  } catch (error) {
    console.error('Error sending message to chat:', error);
    return false;
  }
}

/**
 * インポートエラー時にグループチャットに通知を送信
 * @param chatId グループチャットID（環境変数 NOTIFY_CHAT_ID から取得）
 */
export async function notifyImportError(
  token: string,
  chatId: string,
  errorMessage: string,
  failedRecords: Array<Record<string, unknown>>
): Promise<void> {
  try {
    if (!chatId) {
      console.error('No chat ID provided for notification');
      return;
    }

    // メッセージを構築（JSONデータは最初の3件まで）
    const recordsPreview = failedRecords.slice(0, 3);
    const message = `🚨 インポートエラーが発生しました

エラー: ${errorMessage}

失敗したレコード数: ${failedRecords.length}件

データ（最初の${Math.min(3, failedRecords.length)}件）:
${JSON.stringify(recordsPreview, null, 2).slice(0, 2000)}${failedRecords.length > 3 ? '\n...(以下省略)' : ''}`;

    await sendMessageToChat(token, chatId, message);
  } catch (error) {
    console.error('Failed to notify import error:', error);
  }
}

/**
 * 一般的なエラー発生時にグループチャットに通知を送信
 * トークン取得からエラーまで、全てのエラーに対応
 * @param chatId グループチャットID（環境変数 NOTIFY_CHAT_ID から取得）
 */
export async function notifyGeneralError(
  chatId: string,
  errorMessage: string,
  records?: Array<Record<string, unknown>>
): Promise<void> {
  try {
    if (!chatId) {
      console.error('No chat ID provided for notification');
      return;
    }

    // トークンを取得（エラー通知のため）
    let token: string;
    try {
      token = await getTenantAccessToken();
    } catch (tokenError) {
      console.error('Failed to get token for error notification:', tokenError);
      return;
    }

    // メッセージを構築
    let message = `🚨 インポート処理でエラーが発生しました

エラー: ${errorMessage}`;

    // レコードデータがある場合は追加
    if (records && records.length > 0) {
      const recordsPreview = records.slice(0, 3);
      message += `

レコード数: ${records.length}件

データ（最初の${Math.min(3, records.length)}件）:
${JSON.stringify(recordsPreview, null, 2).slice(0, 2000)}${records.length > 3 ? '\n...(以下省略)' : ''}`;
    }

    await sendMessageToChat(token, chatId, message);
  } catch (error) {
    console.error('Failed to notify general error:', error);
  }
}
