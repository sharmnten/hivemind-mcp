export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code.replaceAll("_", " ").toLowerCase());
  }
}
export function apiClient(token: string) {
  return async function request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const result: unknown = await response.json();
    if (!response.ok)
      throw new ApiError(
        typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "REQUEST_FAILED",
      );
    return result as T;
  };
}
export type Api = ReturnType<typeof apiClient>;
