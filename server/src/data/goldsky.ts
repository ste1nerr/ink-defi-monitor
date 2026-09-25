const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;

export class SubgraphError extends Error {}

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

/** POSTs a GraphQL query with timeout and retry on network errors, 429 and 5xx. */
export async function querySubgraph<T>(url: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 429 || response.status >= 500) {
        throw new SubgraphError(`Subgraph HTTP ${response.status}`);
      }
      const body = (await response.json()) as GraphQLResponse<T>;
      if (body.errors?.length) {
        // Query errors are deterministic; retrying will not help.
        throw Object.assign(new SubgraphError(body.errors.map((e) => e.message).join("; ")), { permanent: true });
      }
      if (!body.data) throw new SubgraphError("Subgraph returned no data");
      return body.data;
    } catch (error) {
      lastError = error;
      if ((error as { permanent?: boolean }).permanent || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export type SubgraphMeta = { block: { number: number; timestamp: number | null }; hasIndexingErrors: boolean };

export async function getSubgraphMeta(url: string): Promise<SubgraphMeta> {
  const data = await querySubgraph<{ _meta: SubgraphMeta }>(
    url,
    "{ _meta { block { number timestamp } hasIndexingErrors } }",
  );
  return data._meta;
}
