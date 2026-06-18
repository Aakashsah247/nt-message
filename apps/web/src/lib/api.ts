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