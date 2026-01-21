'use client';

import { useState, useCallback } from 'react';
import JsonUploader, { ParsedFile } from '@/components/JsonUploader';
import FieldPreview, { ImportProgress } from '@/components/FieldPreview';
import { parseLarkBaseUrl, LarkBaseUrlInfo } from '@/lib/lark';

type Step = 'upload' | 'preview' | 'success';

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

  const handleProceedToPreview = useCallback(() => {
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
    setStep('preview');
  }, [parsedFiles, urlInfo]);

  const handleCancel = () => {
    setStep('upload');
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

  const handleImport = async () => {
    if (!urlInfo) {
      setError('Lark Base URLが必要です');
      return;
    }

    const validFiles = parsedFiles.filter(
      (f) => f.status !== 'error' && f.records.length > 0
    );
    const allRecords = validFiles.flatMap((f) => f.records.map((r) => r.data));

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
    });

    // Update file statuses to processing
    setParsedFiles((prev) =>
      prev.map((f) =>
        f.status !== 'error'
          ? { ...f, status: 'processing' as const }
          : f
      )
    );

    let successCount = 0;
    let failedCount = 0;
    let createdFieldsCount = 0;
    const errors: Array<{ index: number; error: string }> = [];

    // Process records in batches of 500
    const batchSize = 500;
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);

      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: batch,
            appToken: urlInfo.appToken,
            tableId: urlInfo.tableId,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          // Handle batch failure
          for (let j = 0; j < batch.length; j++) {
            errors.push({
              index: i + j,
              error: data.error || 'インポートに失敗しました',
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

      // Update progress
      setImportProgress((prev) => ({
        ...prev,
        current: Math.min(i + batchSize, allRecords.length),
        successCount,
        failedCount,
        errors,
      }));
    }

    // Update file statuses based on results
    setParsedFiles((prev) =>
      prev.map((f) =>
        f.status === 'processing'
          ? { ...f, status: failedCount === 0 ? 'success' : 'error' }
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
    setUrlInfo(null);
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
          <div className="w-12 h-0.5 bg-gray-300 mx-2" />
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
              {step === 'success' ? '✓' : '2'}
            </div>
            <span className="text-sm text-gray-600">確認</span>
          </div>
          <div className="w-12 h-0.5 bg-gray-300 mx-2" />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500'
              }`}
            >
              {step === 'success' ? '✓' : '3'}
            </div>
            <span className="text-sm text-gray-600">完了</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Lark Base URL Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lark Base URL
                </label>
                <input
                  type="text"
                  value={larkUrl}
                  onChange={handleUrlChange}
                  placeholder="https://xxx.larksuite.com/base/bascnXXX?table=tblXXX"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
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
                    onClick={handleProceedToPreview}
                    disabled={validFileCount === 0 || !urlInfo}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    プレビューへ進む
                    <span className="text-sm opacity-80">
                      ({validFileCount}ファイル / {totalRecordCount}レコード)
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              {/* Import Target Info */}
              {urlInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">インポート先</h3>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">App Token:</span> {urlInfo.appToken}
                    <span className="mx-3">|</span>
                    <span className="font-medium">Table ID:</span> {urlInfo.tableId}
                  </p>
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
