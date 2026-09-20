import { AppBadRequestException, ErrorCode } from '../common/exceptions';

export const DEFAULT_USAGES_PAGE_SIZE = 10;
export const MAX_USAGES_PAGE_SIZE = 100;

export interface UsageCursor {
  usageDate: Date;
  id: string;
}

export function encodeUsageCursor(cursor: UsageCursor): string {
  return Buffer.from(
    JSON.stringify({ d: cursor.usageDate.toISOString(), i: cursor.id }),
  ).toString('base64url');
}

export function decodeUsageCursor(raw: string): UsageCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as { d?: unknown; i?: unknown } | null;
    if (
      !parsed ||
      typeof parsed.d !== 'string' ||
      typeof parsed.i !== 'string' ||
      !parsed.i
    ) {
      throw new Error('invalid cursor');
    }
    const usageDate = new Date(parsed.d);
    if (Number.isNaN(usageDate.getTime())) {
      throw new Error('invalid cursor');
    }
    return { usageDate, id: parsed.i };
  } catch {
    throw new AppBadRequestException(
      ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
      'cursor is invalid',
    );
  }
}

export function parseOptionalLimit(limitParam?: string): number | undefined {
  if (limitParam === undefined || limitParam === '') return undefined;
  const limit = Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppBadRequestException(
      ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
      'limit must be a positive integer',
    );
  }
  return Math.min(limit, MAX_USAGES_PAGE_SIZE);
}
