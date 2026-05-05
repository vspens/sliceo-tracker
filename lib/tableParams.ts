export type TableParams = {
  q: string;
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTableParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  options?: {
    qKey?: string;
    pageKey?: string;
    pageSizeKey?: string;
    defaultPageSize?: number;
  },
): TableParams {
  const qKey = options?.qKey ?? "q";
  const pageKey = options?.pageKey ?? "page";
  const pageSizeKey = options?.pageSizeKey ?? "pageSize";

  const getFirst = (key: string) => {
    const raw = searchParams?.[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const q = (getFirst(qKey) ?? "").trim();
  const page = toPositiveInt(getFirst(pageKey), 1);
  const pageSize = Math.min(
    toPositiveInt(getFirst(pageSizeKey), options?.defaultPageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { q, page, pageSize, from, to };
}

export function buildTableHref(
  pathname: string,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.pageSize && params.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("pageSize", String(params.pageSize));
  }
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
