import type { ApiPaginated, ApiSuccess, PageMeta } from '@lemuria/shared';

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function paginated<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
): ApiPaginated<T> {
  const meta: PageMeta = {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
  return { success: true, data, meta };
}
