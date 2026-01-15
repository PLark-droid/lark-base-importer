'use client';

import { useMemo, useState } from 'react';

interface FieldPreviewProps {
  data: Record<string, unknown>;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

type FieldType = 'string' | 'number' | 'boolean' | 'url' | 'email' | 'longtext' | 'array' | 'object' | 'null';

function inferFieldType(key: string, value: unknown): FieldType {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    // URL detection
    if (/^https?:\/\//.test(value)) return 'url';
    // Email detection
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    // Long text detection (over 100 chars or contains newlines)
    if (value.length > 100 || value.includes('\n')) return 'longtext';
    return 'string';
  }
  return 'string';
}

function formatValue(value: unknown, maxLength: number = 80): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  }
  if (typeof value === 'string') {
    // Replace newlines with visual indicator
    const formatted = value.replace(/\n/g, ' ↵ ');
    return formatted.length > maxLength ? formatted.slice(0, maxLength) + '...' : formatted;
  }
  if (typeof value === 'number') {
    // Format large numbers with commas
    return value.toLocaleString('ja-JP');
  }
  return String(value);
}

function getTypeColor(type: FieldType): string {
  switch (type) {
    case 'string':
      return 'bg-green-100 text-green-800';
    case 'number':
      return 'bg-blue-100 text-blue-800';
    case 'boolean':
      return 'bg-purple-100 text-purple-800';
    case 'object':
      return 'bg-yellow-100 text-yellow-800';
    case 'array':
      return 'bg-orange-100 text-orange-800';
    case 'url':
      return 'bg-cyan-100 text-cyan-800';
    case 'email':
      return 'bg-pink-100 text-pink-800';
    case 'longtext':
      return 'bg-indigo-100 text-indigo-800';
    case 'null':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function FieldPreview({
  data,
  fileName,
  onConfirm,
  onCancel,
  isLoading = false,
}: FieldPreviewProps) {
  const fields = useMemo(() => {
    return Object.entries(data).map(([key, value]) => ({
      key,
      value,
      type: inferFieldType(key, value),
    }));
  }, [data]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">フィールドプレビュー</h2>
          <p className="text-sm text-gray-500">
            {fileName} - {fields.length} フィールド
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                インポート中...
              </>
            ) : (
              <>
                <span>🚀</span>
                Lark Baseにインポート
              </>
            )}
          </button>
        </div>
      </div>

      {/* Fields Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-8">
                  #
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-1/4">
                  フィールド名
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-24">
                  型
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  値（プレビュー）
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {fields.map((field, index) => (
                <tr key={field.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-400">{index + 1}</td>
                  <td className="px-4 py-3">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {field.key}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${getTypeColor(
                        field.type
                      )}`}
                    >
                      {field.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600 font-mono">
                      {formatValue(field.value)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>インポート内容:</strong> 1レコード / {fields.length}フィールド
        </p>
        <p className="text-xs text-blue-600 mt-1">
          新しいテーブルが作成され、JSONデータが1レコードとして追加されます
        </p>
      </div>
    </div>
  );
}
