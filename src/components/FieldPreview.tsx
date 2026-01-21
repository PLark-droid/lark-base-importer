'use client';

import { useMemo, useState } from 'react';
import { ParsedFile, ParsedRecord } from './JsonUploader';

export interface ImportProgress {
  current: number;
  total: number;
  successCount: number;
  failedCount: number;
  status: 'idle' | 'importing' | 'completed' | 'error';
  errors: Array<{ index: number; error: string }>;
}

interface FieldPreviewProps {
  files: ParsedFile[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  progress?: ImportProgress;
}

type FieldType = 'string' | 'number' | 'boolean' | 'url' | 'email' | 'longtext' | 'array' | 'object' | 'null';

function inferFieldType(value: unknown): FieldType {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (value.length > 100 || value.includes('\n')) return 'longtext';
    return 'string';
  }
  return 'string';
}

function formatValue(value: unknown, maxLength: number = 50): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  }
  if (typeof value === 'string') {
    const formatted = value.replace(/\n/g, ' ');
    return formatted.length > maxLength ? formatted.slice(0, maxLength) + '...' : formatted;
  }
  if (typeof value === 'number') {
    return value.toLocaleString('ja-JP');
  }
  return String(value);
}

function getTypeColor(type: FieldType): string {
  switch (type) {
    case 'string': return 'bg-green-100 text-green-800';
    case 'number': return 'bg-blue-100 text-blue-800';
    case 'boolean': return 'bg-purple-100 text-purple-800';
    case 'object': return 'bg-yellow-100 text-yellow-800';
    case 'array': return 'bg-orange-100 text-orange-800';
    case 'url': return 'bg-cyan-100 text-cyan-800';
    case 'email': return 'bg-pink-100 text-pink-800';
    case 'longtext': return 'bg-indigo-100 text-indigo-800';
    case 'null': return 'bg-gray-100 text-gray-500';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function FieldPreview({
  files,
  onConfirm,
  onCancel,
  isLoading = false,
  progress,
}: FieldPreviewProps) {
  const [previewLimit] = useState(10);

  // Get all records from all files
  const allRecords = useMemo(() => {
    return files.flatMap((file) =>
      file.records.map((record, index) => ({
        ...record,
        fileName: file.fileName,
        recordIndex: index,
      }))
    );
  }, [files]);

  // Collect all unique field names across all records
  const fieldNames = useMemo(() => {
    const names = new Set<string>();
    allRecords.forEach((record) => {
      Object.keys(record.data).forEach((key) => names.add(key));
    });
    return Array.from(names);
  }, [allRecords]);

  // Infer types from first non-null value
  const fieldTypes = useMemo(() => {
    const types: Record<string, FieldType> = {};
    fieldNames.forEach((name) => {
      for (const record of allRecords) {
        const value = record.data[name];
        if (value !== null && value !== undefined) {
          types[name] = inferFieldType(value);
          break;
        }
      }
      if (!types[name]) {
        types[name] = 'null';
      }
    });
    return types;
  }, [fieldNames, allRecords]);

  const totalRecords = allRecords.length;
  const previewRecords = allRecords.slice(0, previewLimit);
  const hasMore = totalRecords > previewLimit;

  const isImporting = progress?.status === 'importing';
  const isCompleted = progress?.status === 'completed';

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">レコードプレビュー</h2>
          <p className="text-sm text-gray-500">
            {files.length}ファイル / {totalRecords}レコード / {fieldNames.length}フィールド
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading || isImporting}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || isImporting || isCompleted}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <span className="animate-spin">⏳</span>
                インポート中...
              </>
            ) : isCompleted ? (
              <>完了</>
            ) : (
              <>
                <span>🚀</span>
                Lark Baseにインポート
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {progress && progress.status !== 'idle' && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>進捗: {progress.current} / {progress.total}</span>
            <span>
              成功: {progress.successCount} / 失敗: {progress.failedCount}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${
                progress.failedCount > 0 ? 'bg-yellow-500' : 'bg-blue-600'
              }`}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          {progress.status === 'completed' && (
            <div className={`mt-2 text-sm ${progress.failedCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
              {progress.failedCount > 0
                ? `インポート完了（${progress.failedCount}件の失敗）`
                : 'すべてのレコードが正常にインポートされました'
              }
            </div>
          )}
          {progress.errors.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg max-h-32 overflow-y-auto">
              <p className="text-sm font-medium text-red-800 mb-2">エラー詳細:</p>
              {progress.errors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-xs text-red-600">
                  レコード {err.index + 1}: {err.error}
                </p>
              ))}
              {progress.errors.length > 5 && (
                <p className="text-xs text-red-500 mt-1">
                  ...他 {progress.errors.length - 5} 件のエラー
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Field Types */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">フィールド一覧</h3>
        <div className="flex flex-wrap gap-2">
          {fieldNames.map((name) => (
            <div key={name} className="flex items-center gap-1">
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">{name}</code>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(fieldTypes[name])}`}>
                {fieldTypes[name]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Records Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 w-12">#</th>
                {fieldNames.slice(0, 5).map((name) => (
                  <th key={name} className="px-3 py-2 text-left text-xs font-medium text-gray-600 max-w-[200px]">
                    {name}
                  </th>
                ))}
                {fieldNames.length > 5 && (
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">
                    +{fieldNames.length - 5}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {previewRecords.map((record, index) => (
                <tr key={`${record.fileName}-${record.recordIndex}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-400">{index + 1}</td>
                  {fieldNames.slice(0, 5).map((name) => (
                    <td key={name} className="px-3 py-2 max-w-[200px]">
                      <span className="text-xs text-gray-600 font-mono truncate block">
                        {formatValue(record.data[name])}
                      </span>
                    </td>
                  ))}
                  {fieldNames.length > 5 && (
                    <td className="px-3 py-2 text-xs text-gray-400">...</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hasMore && (
        <p className="mt-2 text-xs text-gray-500 text-center">
          他 {totalRecords - previewLimit} 件のレコードがあります
        </p>
      )}

      {/* Summary */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>インポート内容:</strong> {totalRecords}レコード / {fieldNames.length}フィールド
        </p>
        <p className="text-xs text-blue-600 mt-1">
          {totalRecords > 500
            ? `500レコードごとに分割してバッチ処理されます（計 ${Math.ceil(totalRecords / 500)} バッチ）`
            : '既存のテーブルにレコードが追加されます'
          }
        </p>
      </div>
    </div>
  );
}
