'use client';

import { useState } from 'react';

export interface ExistingField {
  field_id: string;
  field_name: string;
  normalized_name: string;
  type: number;
}

export interface SimilarMatch {
  jsonField: string;
  existingField: string;
  normalizedName: string;
}

export interface FieldMappingDecision {
  // 類似フィールドのマッピング決定: jsonField -> existingField or null(新規作成)
  similarMappings: Map<string, string | null>;
  // 新規フィールド作成の承認
  approvedNewFields: Set<string>;
}

interface FieldValidationProps {
  exactMatches: Array<{ jsonField: string; existingField: string }>;
  similarMatches: SimilarMatch[];
  newFields: string[];
  onApprove: (decision: FieldMappingDecision) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function FieldValidation({
  exactMatches,
  similarMatches,
  newFields,
  onApprove,
  onCancel,
  isLoading = false,
}: FieldValidationProps) {
  // 類似フィールドのマッピング状態: jsonField -> 'existing' | 'new'
  const [similarDecisions, setSimilarDecisions] = useState<Map<string, 'existing' | 'new'>>(() => {
    const initial = new Map<string, 'existing' | 'new'>();
    similarMatches.forEach((m) => initial.set(m.jsonField, 'existing'));
    return initial;
  });

  // 新規フィールドの承認状態
  const [approvedNew, setApprovedNew] = useState<Set<string>>(() => new Set(newFields));

  const handleSimilarDecision = (jsonField: string, decision: 'existing' | 'new') => {
    setSimilarDecisions((prev) => {
      const next = new Map(prev);
      next.set(jsonField, decision);
      return next;
    });
  };

  const toggleNewFieldApproval = (field: string) => {
    setApprovedNew((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const toggleAllNewFields = () => {
    if (approvedNew.size === newFields.length) {
      setApprovedNew(new Set());
    } else {
      setApprovedNew(new Set(newFields));
    }
  };

  const handleApprove = () => {
    const similarMappings = new Map<string, string | null>();
    similarMatches.forEach((m) => {
      const decision = similarDecisions.get(m.jsonField);
      if (decision === 'existing') {
        similarMappings.set(m.jsonField, m.existingField);
      } else {
        similarMappings.set(m.jsonField, null); // null = 新規作成
      }
    });

    onApprove({
      similarMappings,
      approvedNewFields: approvedNew,
    });
  };

  const hasNewFields = newFields.length > 0;
  const hasSimilarFields = similarMatches.length > 0;
  const needsApproval = hasNewFields || hasSimilarFields;

  return (
    <div className="space-y-6">
      {/* 完全一致フィールド */}
      {exactMatches.length > 0 && (
        <div className="border border-green-200 rounded-lg overflow-hidden">
          <div className="bg-green-50 px-4 py-3 border-b border-green-200">
            <h3 className="text-sm font-medium text-green-800 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              既存フィールドに一致 ({exactMatches.length}件)
            </h3>
            <p className="text-xs text-green-600 mt-1">そのまま既存フィールドに格納されます</p>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3">
              {exactMatches.map(({ jsonField }) => (
                <span
                  key={jsonField}
                  className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded truncate"
                  title={jsonField}
                >
                  {jsonField}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 類似フィールド（確認必要） */}
      {hasSimilarFields && (
        <div className="border border-yellow-200 rounded-lg overflow-hidden">
          <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200">
            <h3 className="text-sm font-medium text-yellow-800 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              類似フィールドを検出 ({similarMatches.length}件)
            </h3>
            <p className="text-xs text-yellow-600 mt-1">
              半角/全角などの差異があります。既存フィールドに格納するか、新規作成するか選択してください。
            </p>
          </div>
          <div className="divide-y divide-yellow-100">
            {similarMatches.map((match) => (
              <div key={match.jsonField} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <code className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs truncate">
                      {match.jsonField}
                    </code>
                    <span className="text-gray-400">→</span>
                    <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs truncate">
                      {match.existingField}
                    </code>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSimilarDecision(match.jsonField, 'existing')}
                    disabled={isLoading}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      similarDecisions.get(match.jsonField) === 'existing'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    既存に格納
                  </button>
                  <button
                    onClick={() => handleSimilarDecision(match.jsonField, 'new')}
                    disabled={isLoading}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      similarDecisions.get(match.jsonField) === 'new'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    新規作成
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新規フィールド（承認必要） */}
      {hasNewFields && (
        <div className="border border-blue-200 rounded-lg overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-blue-800 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  新規フィールド ({newFields.length}件)
                </h3>
                <p className="text-xs text-blue-600 mt-1">
                  テーブルに存在しないフィールドです。作成を承認してください。
                </p>
              </div>
              <button
                onClick={toggleAllNewFields}
                disabled={isLoading}
                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
              >
                {approvedNew.size === newFields.length ? 'すべて解除' : 'すべて選択'}
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <div className="divide-y divide-blue-100">
              {newFields.map((field) => (
                <label
                  key={field}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={approvedNew.has(field)}
                    onChange={() => toggleNewFieldApproval(field)}
                    disabled={isLoading}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <code className="text-xs text-gray-700 truncate">{field}</code>
                </label>
              ))}
            </div>
          </div>
          {approvedNew.size < newFields.length && (
            <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
              <p className="text-xs text-yellow-700">
                未承認のフィールド（{newFields.length - approvedNew.size}件）はスキップされ、データは格納されません。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 承認が不要な場合 */}
      {!needsApproval && exactMatches.length > 0 && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            すべてのJSONフィールドが既存テーブルのフィールドと一致しています。
          </p>
        </div>
      )}

      {/* 承認ボタン */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          戻る
        </button>
        <button
          onClick={handleApprove}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="animate-spin">⏳</span>
              処理中...
            </>
          ) : (
            <>
              承認してプレビューへ
            </>
          )}
        </button>
      </div>
    </div>
  );
}
