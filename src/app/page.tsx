'use client';

import { useState, useCallback, useEffect } from 'react';
import JsonUploader, { ParsedFile } from '@/components/JsonUploader';
import FieldPreview, { ImportProgress, FieldTypeMapping } from '@/components/FieldPreview';
import FieldValidation, { FieldMappingDecision, ExistingField } from '@/components/FieldValidation';
import { parseLarkBaseUrl, LarkBaseUrlInfo, validateFieldsAgainstExisting, FieldValidationResult } from '@/lib/lark';

type Step = 'upload' | 'validation' | 'preview' | 'success';

// 環境変数から固定URL情報を取得
const DEFAULT_APP_TOKEN = process.env.NEXT_PUBLIC_DEFAULT_APP_TOKEN;
const DEFAULT_TABLE_ID = process.env.NEXT_PUBLIC_DEFAULT_TABLE_ID;
const isUrlFixed = !!(DEFAULT_APP_TOKEN && DEFAULT_TABLE_ID);

interface ImportSummary {
  totalRecords: number;
  successCount: number;
  failedCount: number;
  createdFieldsCount: number;
}

export default function Home() {
  const [step, setStep] = useState<Step>('upload');
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [larkUrl, setLarkUrl] = useState('');
  const [urlInfo, setUrlInfo] = useState<LarkBaseUrlInfo | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    current: 0,
    total: 0,
    successCount: 0,
    failedCount: 0,
    status: 'idle',
    errors: [],
  });
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // フィールドバリデーション関連の状態
  const [existingFields, setExistingFields] = useState<ExistingField[]>([]);
  const [validationResult, setValidationResult] = useState<FieldValidationResult | null>(null);
  const [fieldMappingDecision, setFieldMappingDecision] = useState<FieldMappingDecision | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Base情報（固定モード用）
  const [baseInfo, setBaseInfo] = useState<{ appName: string; tableName: string } | null>(null);
  const [isLoadingBaseInfo, setIsLoadingBaseInfo] = useState(false);
  const [baseInfoError, setBaseInfoError] = useState(false);

  // 環境変数で固定されている場合、初期化時にurlInfoを設定
  useEffect(() => {
    if (isUrlFixed && DEFAULT_APP_TOKEN && DEFAULT_TABLE_ID) {
      setUrlInfo({
        appToken: DEFAULT_APP_TOKEN,
        tableId: DEFAULT_TABLE_ID,
      });
    }
  }, []);

  // Base情報を取得（固定モード時）- 一度だけ実行
  useEffect(() => {
    if (isUrlFixed && urlInfo && !baseInfo && !isLoadingBaseInfo && !baseInfoError) {
      setIsLoadingBaseInfo(true);
      fetch('/api/app-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appToken: urlInfo.appToken,
          tableId: urlInfo.tableId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setBaseInfo({
              appName: data.data.appName,
              tableName: data.data.tableName,
            });
          } else {
            console.error('Failed to fetch base info:', data.error);
            setBaseInfoError(true);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch base info:', err);
          setBaseInfoError(true);
        })
        .finally(() => {
          setIsLoadingBaseInfo(false);
        });
    }
  }, [isUrlFixed, urlInfo, baseInfo, isLoadingBaseInfo, baseInfoError]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setLarkUrl(url);
    setUrlError(null);

    if (!url.trim()) {
      setUrlInfo(null);
      return;
    }

    const parsed = parseLarkBaseUrl(url);
    if (parsed) {
      setUrlInfo(parsed);
    } else {
      setUrlInfo(null);
      setUrlError('有効なLark Base URLを入力してください');
    }
  }, []);

  const handleJsonParsed = useCallback((files: ParsedFile[]) => {
    setParsedFiles(files);
  }, []);

  const handleProceedToValidation = useCallback(async () => {
    const validFiles = parsedFiles.filter(
      (f) => f.status !== 'error' && f.records.length > 0
    );
    if (validFiles.length === 0) {
      setError('インポート可能なファイルがありません');
      return;
    }
    if (!urlInfo) {
      setError('Lark Base URLを入力してください');
      return;
    }
    setError(null);
    setIsValidating(true);

    try {
      // 既存フィールドを取得
      const response = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appToken: urlInfo.appToken,
          tableId: urlInfo.tableId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || '既存フィールドの取得に失敗しました');
        setIsValidating(false);
        return;
      }

      const fields: ExistingField[] = data.data.fields;
      setExistingFields(fields);

      // JSONからフィールド名を収集
      const allJsonFields = new Set<string>();
      validFiles.forEach((f) => {
        f.records.forEach((r) => {
          Object.keys(r.data).forEach((key) => allJsonFields.add(key));
        });
      });

      // バリデーション実行
      const result = validateFieldsAgainstExisting(
        Array.from(allJsonFields),
        fields.map((f) => ({ field_name: f.field_name, normalized_name: f.normalized_name }))
      );
      setValidationResult(result);
      setStep('validation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'バリデーションに失敗しました');
    } finally {
      setIsValidating(false);
    }
  }, [parsedFiles, urlInfo]);

  const handleValidationApprove = useCallback((decision: FieldMappingDecision) => {
    setFieldMappingDecision(decision);
    setStep('preview');
  }, []);

  const handleValidationCancel = useCallback(() => {
    setStep('upload');
    setValidationResult(null);
    setExistingFields([]);
  }, []);

  const handleCancel = () => {
    setStep('validation');
    setError(null);
    setImportProgress({
      current: 0,
      total: 0,
      successCount: 0,
      failedCount: 0,
      status: 'idle',
      errors: [],
    });
  };

  const handleImport = async (fieldTypes: FieldTypeMapping) => {
    if (!urlInfo) {
      setError('Lark Base URLが必要です');
      return;
    }

    const validFiles = parsedFiles.filter(
      (f) => f.status !== 'error' && f.records.length > 0
    );

    // フィールドマッピング決定に基づいてレコードを変換
    // シンプル化: 類似フィールドのマッピングのみ適用し、それ以外はすべて通す
    const transformRecord = (data: Record<string, unknown>): Record<string, unknown> => {
      const transformed: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(data)) {
        // 類似フィールドのマッピングをチェック
        if (fieldMappingDecision?.similarMappings.has(key)) {
          const mappedField = fieldMappingDecision.similarMappings.get(key);
          if (mappedField !== null && mappedField !== undefined) {
            // 既存フィールドにマッピング
            transformed[mappedField] = value;
          } else {
            // null = 新規作成
            transformed[key] = value;
          }
        } else {
          // それ以外はすべてそのまま通す
          transformed[key] = value;
        }
      }

      return transformed;
    };

    // 各レコードに元のJSONを丸ごと格納するフィールドを追加
    const allRecords = validFiles.flatMap((f) => f.records.map((r) => {
      const transformed = transformRecord(r.data);
      return {
        ...transformed,
        _raw_json: JSON.stringify(r.data, null, 2),
      };
    }));

    if (allRecords.length === 0) {
      setError('インポートするレコードがありません');
      return;
    }

    setError(null);
    setImportProgress({
      current: 0,
      total: allRecords.length,
      successCount: 0,
      failedCount: 0,
      status: 'importing',
      errors: [],
      currentFile: 1,
      totalFiles: validFiles.length,
    });

    // フィールド型情報をログ出力（デバッグ用）
    console.log('Selected field types:', fieldTypes);

    // Update file statuses to pending before processing
    setParsedFiles((prev) =>
      prev.map((f, idx) =>
        f.status !== 'error'
          ? { ...f, status: idx === 0 ? 'processing' as const : 'pending' as const }
          : f
      )
    );

    let successCount = 0;
    let failedCount = 0;
    let createdFieldsCount = 0;
    const errors: Array<{ index: number; error: string }> = [];

    // Calculate cumulative record counts for each file
    const fileBoundaries: number[] = [];
    let cumulative = 0;
    validFiles.forEach((f) => {
      cumulative += f.records.length;
      fileBoundaries.push(cumulative);
    });

    // Helper function to get current file index from processed record count
    const getCurrentFileIndex = (processedCount: number): number => {
      for (let i = 0; i < fileBoundaries.length; i++) {
        if (processedCount < fileBoundaries[i]) {
          return i;
        }
      }
      return validFiles.length - 1;
    };

    // Process records in batches of 500
    const batchSize = 500;
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);

      // Calculate current file being processed
      const currentFileIdx = getCurrentFileIndex(i);

      // Update file statuses
      setParsedFiles((prev) => {
        const validIndices = prev
          .map((f, idx) => ({ f, idx }))
          .filter(({ f }) => f.status !== 'error')
          .map(({ idx }) => idx);

        return prev.map((f, idx) => {
          if (f.status === 'error') return f;
          const validIdx = validIndices.indexOf(idx);
          if (validIdx < currentFileIdx) return { ...f, status: 'success' as const };
          if (validIdx === currentFileIdx) return { ...f, status: 'processing' as const };
          return { ...f, status: 'pending' as const };
        });
      });

      try {
        // デバッグ: バッチの最初のレコードをログ出力
        console.log(`Batch ${i / batchSize + 1}: Sending ${batch.length} records`);
        if (batch.length > 0) {
          console.log('First record keys:', Object.keys(batch[0]));
        }

        const response = await fetch('/api/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: batch,
            appToken: urlInfo.appToken,
            tableId: urlInfo.tableId,
            fieldTypes,
          }),
        });

        const data = await response.json();
        console.log('API Response:', { status: response.status, success: data.success, error: data.error, failedCount: data.data?.failedCount });

        if (!response.ok || !data.success) {
          // Handle batch failure - より詳細なエラーメッセージを表示
          const errorMsg = data.error || data.data?.errors?.[0]?.error || 'インポートに失敗しました';
          console.error('Import failed:', errorMsg);
          for (let j = 0; j < batch.length; j++) {
            errors.push({
              index: i + j,
              error: errorMsg,
            });
          }
          failedCount += batch.length;
        } else {
          successCount += data.data?.successCount || batch.length;
          failedCount += data.data?.failedCount || 0;
          createdFieldsCount += data.data?.createdFieldsCount || 0;
          if (data.data?.errors) {
            errors.push(...data.data.errors.map((e: { index: number; error: string }) => ({
              index: i + e.index,
              error: e.error,
            })));
          }
        }
      } catch (err) {
        // Handle network/unexpected errors
        for (let j = 0; j < batch.length; j++) {
          errors.push({
            index: i + j,
            error: err instanceof Error ? err.message : 'エラーが発生しました',
          });
        }
        failedCount += batch.length;
      }

      // Update progress with file info
      const processedCount = Math.min(i + batchSize, allRecords.length);
      const currentFileForProgress = getCurrentFileIndex(processedCount - 1) + 1;

      setImportProgress((prev) => ({
        ...prev,
        current: processedCount,
        successCount,
        failedCount,
        errors,
        currentFile: currentFileForProgress,
        totalFiles: validFiles.length,
      }));
    }

    // Update file statuses based on results
    // Note: インポート失敗でもファイルステータスは 'success' にしないと
    // validFileCount が 0 になってしまうため、'completed' として扱う
    setParsedFiles((prev) =>
      prev.map((f) =>
        f.status === 'processing' || f.status === 'pending'
          ? { ...f, status: 'success' as const }
          : f
      )
    );

    setImportProgress((prev) => ({
      ...prev,
      status: 'completed',
    }));

    setSummary({
      totalRecords: allRecords.length,
      successCount,
      failedCount,
      createdFieldsCount,
    });

    if (failedCount === 0) {
      setStep('success');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setParsedFiles([]);
    setLarkUrl('');
    // 固定URLモードの場合、urlInfoをリセットしない（useEffectが再実行されないため）
    if (!isUrlFixed) {
      setUrlInfo(null);
    }
    setUrlError(null);
    setError(null);
    setImportProgress({
      current: 0,
      total: 0,
      successCount: 0,
      failedCount: 0,
      status: 'idle',
      errors: [],
    });
    setSummary(null);
    setExistingFields([]);
    setValidationResult(null);
    setFieldMappingDecision(null);
  };

  const validFileCount = parsedFiles.filter(
    (f) => f.status !== 'error' && f.records.length > 0
  ).length;
  const totalRecordCount = parsedFiles
    .filter((f) => f.status !== 'error')
    .reduce((sum, f) => sum + f.records.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            JSON → Lark Base Importer
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            JSONデータを既存のLark Baseテーブルにインポート
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === 'upload'
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-500 text-white'
              }`}
            >
              {step === 'upload' ? '1' : '✓'}
            </div>
            <span className="text-sm text-gray-600">入力</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 mx-1" />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === 'validation'
                  ? 'bg-blue-600 text-white'
                  : step === 'preview' || step === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500'
              }`}
            >
              {step === 'preview' || step === 'success' ? '✓' : '2'}
            </div>
            <span className="text-sm text-gray-600">検証</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 mx-1" />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === 'preview'
                  ? 'bg-blue-600 text-white'
                  : step === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500'
              }`}
            >
              {step === 'success' ? '✓' : '3'}
            </div>
            <span className="text-sm text-gray-600">確認</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 mx-1" />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500'
              }`}
            >
              {step === 'success' ? '✓' : '4'}
            </div>
            <span className="text-sm text-gray-600">完了</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Lark Base URL Input - 環境変数で固定されていない場合のみ表示 */}
              {!isUrlFixed ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lark Base URL
                  </label>
                  <input
                    type="text"
                    value={larkUrl}
                    onChange={handleUrlChange}
                    placeholder="https://xxx.larksuite.com/base/bascnXXX?table=tblXXX"
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-gray-900 placeholder-gray-400 ${
                      urlError ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {urlError && (
                    <p className="text-xs text-red-500 mt-2">{urlError}</p>
                  )}
                  {urlInfo && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-xs text-green-700">
                        <span className="font-medium">App Token:</span> {urlInfo.appToken}
                        <span className="mx-2">|</span>
                        <span className="font-medium">Table ID:</span> {urlInfo.tableId}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    インポート先のLark Baseテーブルを開き、URLをコピーして貼り付けてください
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">インポート先（固定）</h3>
                  {isLoadingBaseInfo ? (
                    <p className="text-sm text-blue-600">読み込み中...</p>
                  ) : baseInfo ? (
                    <div className="space-y-1">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">Base:</span> {baseInfo.appName}
                      </p>
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">テーブル:</span> {baseInfo.tableName}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-blue-700">
                      <span className="font-medium">App Token:</span> {urlInfo?.appToken}
                      <span className="mx-3">|</span>
                      <span className="font-medium">Table ID:</span> {urlInfo?.tableId}
                    </p>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">JSONデータ</h3>
                <JsonUploader
                  onJsonParsed={handleJsonParsed}
                  parsedFiles={parsedFiles}
                />
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* Proceed Button */}
              {parsedFiles.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={handleProceedToValidation}
                    disabled={validFileCount === 0 || !urlInfo || isValidating}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isValidating ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        フィールドを検証中...
                      </>
                    ) : (
                      <>
                        フィールドを検証
                        <span className="text-sm opacity-80">
                          ({validFileCount}ファイル / {totalRecordCount}レコード)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'validation' && validationResult && (
            <div className="space-y-6">
              {/* Import Target Info */}
              {urlInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">インポート先</h3>
                  {baseInfo ? (
                    <div className="space-y-1">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">Base:</span> {baseInfo.appName}
                        <span className="mx-3">|</span>
                        <span className="font-medium">テーブル:</span> {baseInfo.tableName}
                      </p>
                      <p className="text-xs text-blue-600">
                        既存フィールド: {existingFields.length}件
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">App Token:</span> {urlInfo.appToken}
                        <span className="mx-3">|</span>
                        <span className="font-medium">Table ID:</span> {urlInfo.tableId}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        既存フィールド: {existingFields.length}件
                      </p>
                    </>
                  )}
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <FieldValidation
                exactMatches={validationResult.exactMatches}
                similarMatches={validationResult.similarMatches}
                newFields={validationResult.newFields}
                onApprove={handleValidationApprove}
                onCancel={handleValidationCancel}
                isLoading={isValidating}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              {/* Import Target Info */}
              {urlInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">インポート先</h3>
                  {baseInfo ? (
                    <p className="text-sm text-blue-700">
                      <span className="font-medium">Base:</span> {baseInfo.appName}
                      <span className="mx-3">|</span>
                      <span className="font-medium">テーブル:</span> {baseInfo.tableName}
                    </p>
                  ) : (
                    <p className="text-sm text-blue-700">
                      <span className="font-medium">App Token:</span> {urlInfo.appToken}
                      <span className="mx-3">|</span>
                      <span className="font-medium">Table ID:</span> {urlInfo.tableId}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <FieldPreview
                files={parsedFiles.filter((f) => f.status !== 'error')}
                onConfirm={handleImport}
                onCancel={handleCancel}
                isLoading={importProgress.status === 'importing'}
                progress={importProgress}
              />
            </div>
          )}

          {step === 'success' && summary && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                インポート完了！
              </h2>
              <p className="text-gray-600 mb-6">
                JSONデータがLark Baseに正常にインポートされました
              </p>

              <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left max-w-md mx-auto">
                <h3 className="font-medium text-gray-700 mb-3">インポート結果</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">ファイル数:</dt>
                    <dd className="font-mono text-gray-800">{validFileCount}ファイル</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">レコード数:</dt>
                    <dd className="font-mono text-gray-800">{summary.successCount}レコード</dd>
                  </div>
                  {summary.failedCount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">失敗:</dt>
                      <dd className="font-mono text-red-600">{summary.failedCount}レコード</dd>
                    </div>
                  )}
                  {summary.createdFieldsCount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">新規フィールド:</dt>
                      <dd className="font-mono text-green-600">{summary.createdFieldsCount}フィールド</dd>
                    </div>
                  )}
                </dl>
              </div>

              <button
                onClick={handleReset}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                別のJSONをインポート
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-gray-500">
        <p>JSON → Lark Base Importer | Powered by Next.js</p>
      </footer>
    </div>
  );
}
