'use client';

import { useState, useCallback } from 'react';

export interface ParsedRecord {
  data: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export interface ParsedFile {
  fileName: string;
  records: ParsedRecord[];
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface JsonUploaderProps {
  onJsonParsed: (files: ParsedFile[]) => void;
  parsedFiles: ParsedFile[];
}

type InputMode = 'file' | 'text';

export default function JsonUploader({ onJsonParsed, parsedFiles }: JsonUploaderProps) {
  const [mode, setMode] = useState<InputMode>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');

  const parseAndValidateJson = useCallback(
    (content: string, sourceName: string): ParsedFile | null => {
      try {
        const parsed = JSON.parse(content);

        // Handle array of objects
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            return {
              fileName: sourceName,
              records: [],
              status: 'error',
              error: '空の配列はインポートできません',
            };
          }

          const invalidItems = parsed.filter(
            (item) => typeof item !== 'object' || item === null || Array.isArray(item)
          );
          if (invalidItems.length > 0) {
            return {
              fileName: sourceName,
              records: [],
              status: 'error',
              error: '配列内のすべての要素はオブジェクトである必要があります',
            };
          }

          const records: ParsedRecord[] = parsed.map((item) => ({
            data: item as Record<string, unknown>,
            status: 'pending' as const,
          }));

          return {
            fileName: sourceName,
            records,
            status: 'pending',
          };
        }

        // Handle single object
        if (typeof parsed !== 'object' || parsed === null) {
          return {
            fileName: sourceName,
            records: [],
            status: 'error',
            error: 'JSONオブジェクトまたは配列形式で入力してください',
          };
        }

        if (Object.keys(parsed).length === 0) {
          return {
            fileName: sourceName,
            records: [],
            status: 'error',
            error: '空のJSONオブジェクトはインポートできません',
          };
        }

        return {
          fileName: sourceName,
          records: [{ data: parsed, status: 'pending' }],
          status: 'pending',
        };
      } catch {
        return {
          fileName: sourceName,
          records: [],
          status: 'error',
          error: 'JSONの解析に失敗しました。有効なJSON形式か確認してください',
        };
      }
    },
    []
  );

  const handleFiles = useCallback(
    (files: FileList) => {
      setError(null);
      const fileArray = Array.from(files);
      const jsonFiles = fileArray.filter((f) => f.name.endsWith('.json'));

      if (jsonFiles.length === 0) {
        setError('JSONファイルを選択してください');
        return;
      }

      if (jsonFiles.length !== fileArray.length) {
        setError(`${fileArray.length - jsonFiles.length}件のファイルがJSON以外のため除外されました`);
      }

      const readPromises = jsonFiles.map(
        (file) =>
          new Promise<ParsedFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const content = e.target?.result as string;
              const result = parseAndValidateJson(content, file.name);
              resolve(result || { fileName: file.name, records: [], status: 'error', error: '読み込み失敗' });
            };
            reader.onerror = () => {
              resolve({ fileName: file.name, records: [], status: 'error', error: 'ファイルの読み込みに失敗しました' });
            };
            reader.readAsText(file);
          })
      );

      Promise.all(readPromises).then((results) => {
        const newFiles = [...parsedFiles, ...results];
        onJsonParsed(newFiles);
      });
    },
    [parseAndValidateJson, onJsonParsed, parsedFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = parsedFiles.filter((_, i) => i !== index);
      onJsonParsed(newFiles);
    },
    [parsedFiles, onJsonParsed]
  );

  const handleTextSubmit = useCallback(() => {
    if (!jsonText.trim()) {
      setError('JSONを入力してください');
      return;
    }
    const result = parseAndValidateJson(jsonText, 'テキスト入力');
    if (result) {
      onJsonParsed([...parsedFiles, result]);
      setJsonText('');
    }
  }, [jsonText, parseAndValidateJson, onJsonParsed, parsedFiles]);

  return (
    <div className="w-full">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => {
            setMode('file');
            setError(null);
          }}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            mode === 'file'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ファイルアップロード
        </button>
        <button
          onClick={() => {
            setMode('text');
            setError(null);
          }}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            mode === 'text'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          テキスト入力
        </button>
      </div>

      {/* File Upload Mode */}
      {mode === 'file' && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            border-2 border-dashed rounded-xl p-12
            flex flex-col items-center justify-center
            transition-all duration-200 cursor-pointer
            ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }
          `}
        >
          <div className="text-6xl mb-4">📄</div>
          <p className="text-lg font-medium text-gray-700 mb-2">
            JSONファイルをドラッグ＆ドロップ
          </p>
          <p className="text-sm text-gray-500 mb-1">複数ファイル対応</p>
          <p className="text-sm text-gray-500 mb-4">または</p>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
            ファイルを選択
            <input
              type="file"
              accept=".json"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* File List Preview */}
      {parsedFiles.length > 0 && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-700">
              アップロード済みファイル ({parsedFiles.length}件)
            </h4>
          </div>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
            {parsedFiles.map((file, index) => (
              <li
                key={`${file.fileName}-${index}`}
                className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      file.status === 'success'
                        ? 'bg-green-500'
                        : file.status === 'error'
                        ? 'bg-red-500'
                        : file.status === 'processing'
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-yellow-500'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{file.fileName}</p>
                    {file.status === 'error' && file.error && (
                      <p className="text-xs text-red-500">{file.error}</p>
                    )}
                    {file.status === 'success' && (
                      <p className="text-xs text-green-600">インポート完了</p>
                    )}
                    {file.status === 'processing' && (
                      <p className="text-xs text-blue-600">処理中...</p>
                    )}
                    {file.status === 'pending' && (
                      <p className="text-xs text-gray-500">
                        {file.records.length} レコード
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="削除"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Text Input Mode */}
      {mode === 'text' && (
        <div className="space-y-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='[{"key": "value"}, {"key": "value2"}] または {"key": "value"}'
            className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm resize-none bg-white text-gray-900 placeholder-gray-400"
          />
          <button
            onClick={handleTextSubmit}
            disabled={!jsonText.trim()}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            JSONを読み込む
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
