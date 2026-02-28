import { NextRequest, NextResponse } from 'next/server';

type JsonObject = Record<string, unknown>;

export function authorizeApiRequest(request: NextRequest): NextResponse | null {
  const apiSecretKey = process.env.API_SECRET_KEY;

  if (apiSecretKey) {
    const providedKey = request.headers.get('x-api-key');
    if (providedKey !== apiSecretKey) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }

    return null;
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: 'Forbidden', success: false },
      { status: 403 }
    );
  }

  return null;
}

export async function parseJsonBody(
  request: NextRequest
): Promise<{ data: JsonObject } | { response: NextResponse }> {
  const rawBody = await request.text();

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      return {
        response: NextResponse.json(
          { error: 'Invalid JSON body', success: false },
          { status: 400 }
        ),
      };
    }

    return { data: parsed };
  } catch (error) {
    console.error('JSON parse error:', error);
    return {
      response: NextResponse.json(
        { error: 'Invalid JSON body', success: false },
        { status: 400 }
      ),
    };
  }
}

export function getRequiredTrimmedString(
  body: JsonObject,
  key: string
): string | null {
  const value = body[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getRecordsArray(
  body: JsonObject
): Array<Record<string, unknown>> | null {
  const value = body.records;
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    return null;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
