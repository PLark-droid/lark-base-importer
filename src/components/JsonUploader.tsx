'use client';

import { useState, useCallback } from 'react';

interface JsonUploaderProps {
  onJsonParsed: (data: Record<string, unknown>, fileName: string) => void;
}

type InputMode = 'file' | 'text';

export default function JsonUploader({ onJsonParsed }: JsonUploaderProps) {
  const [mode, setMode] = useState<InputMode>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');

  const parseAndValidateJson = useCallback(
    (content: string, sourceName: string) => {
      setError(null);
      try {
        const parsed = JSON.parse(content);

        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError('JSONオブジェクト形式で入力してください（配列は非対応）');
          return;
        }

        if (Object.keys(parsed).length === 0) {
          setError('空のJSONオブジェクトはインポートできません');
          return;
        }

        onJsonParsed(parsed, sourceName);
      } catch {
        setError('JSONの解析に失敗しました。有効なJSON形式か確認してください');
      }
    },
    [onJsonParsed]
  );

  const handleFile = useCallback(
    (file: File) => {
      setError(null);

      if (!file.name.endsWith('.json')) {
        setError('JSONファイルを選択してください');
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result as string;
        parseAndValidateJson(content, file.name);
      };

      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };

      reader.readAsText(file);
    },
    [parseAndValidateJson]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
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
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleTextSubmit = useCallback(() => {
    if (!jsonText.trim()) {
      setError('JSONを入力してください');
      return;
    }
    parseAndValidateJson(jsonText, 'テキスト入力');
  }, [jsonText, parseAndValidateJson]);

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
          <p className="text-sm text-gray-500 mb-4">または</p>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
            ファイルを選択
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Text Input Mode */}
      {mode === 'text' && (
        <div className="space-y-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{"key": "value", "name": "example"}'
            className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm resize-none"
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
