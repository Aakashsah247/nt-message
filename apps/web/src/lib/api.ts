import type {
  ApiErrorResponse,
} from "../types/auth";

const API_URL =
  import.meta.env.VITE_API_URL ??
  "http://localhost:4000/api/v1";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers =
    new Headers(options.headers);

  if (
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers,

      // Sends the HttpOnly refresh cookie.
      credentials: "include",
    },
  );

  const body = await response
    .json()
    .catch(() => null) as
      | ApiErrorResponse
      | T
      | null;

  if (!response.ok) {
    const errorBody =
      body as ApiErrorResponse | null;

    const message =
      Array.isArray(errorBody?.message)
        ? errorBody.message.join(" ")
        : errorBody?.message ??
          "The request could not be completed.";

    throw new Error(message);
  }

  return body as T;
}
export interface ApiDownloadResult {
  blob: Blob;
  filename: string;
  truncated: boolean;
}

export async function apiDownload(
  path: string,
  options: RequestInit = {},
): Promise<ApiDownloadResult> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: new Headers(options.headers),
    credentials: "include",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | ApiErrorResponse
      | null;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(" ")
      : errorBody?.message ?? "The report export could not be completed.";
    throw new Error(message);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition);

  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ?? "nt-message-report.csv",
    truncated:
      response.headers.get("X-Report-Truncated") === "true" ||
      (filenameMatch?.[1] ?? "").toLowerCase().endsWith("-partial.csv"),
  };
}
