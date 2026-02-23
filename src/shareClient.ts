export interface ShortShareLinkResult {
  code: string;
  shareUrl: string;
  expiresAt: string;
}

export interface ResolveShortShareResult {
  token: string;
  expiresAt: string | null;
}

export class ShareClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ShareClientError";
    this.code = code;
    this.status = status;
  }
}

const parseError = async (response: Response): Promise<ShareClientError> => {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Ignore invalid JSON and fallback to generic errors.
  }

  const errorBlock =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : null;

  const code = typeof errorBlock?.code === "string" && errorBlock.code.trim() ? errorBlock.code.trim() : "SHARE_REQUEST_FAILED";
  const message =
    typeof errorBlock?.message === "string" && errorBlock.message.trim()
      ? errorBlock.message.trim()
      : `Share request failed with status ${response.status}`;

  return new ShareClientError(code, message, response.status);
};

export const createShortShareLink = async (token: string): Promise<ShortShareLinkResult> => {
  let response: Response;
  try {
    response = await fetch("/api/share/shorten", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ token })
    });
  } catch {
    throw new ShareClientError("SHARE_PROXY_UNREACHABLE", "Share service unreachable", 0);
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = (await response.json()) as Partial<ShortShareLinkResult>;
  if (!payload || typeof payload.code !== "string" || typeof payload.shareUrl !== "string") {
    throw new ShareClientError("SHARE_EMPTY_RESPONSE", "Share service returned an invalid response", response.status);
  }

  return {
    code: payload.code,
    shareUrl: payload.shareUrl,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : ""
  };
};

export const resolveShortShareCode = async (code: string): Promise<ResolveShortShareResult> => {
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new ShareClientError("SHARE_CODE_INVALID", "Invalid share code", 400);
  }

  let response: Response;
  try {
    response = await fetch(`/api/share/resolve?code=${encodeURIComponent(cleanCode)}`, {
      method: "GET"
    });
  } catch {
    throw new ShareClientError("SHARE_PROXY_UNREACHABLE", "Share service unreachable", 0);
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = (await response.json()) as Partial<ResolveShortShareResult>;
  if (!payload || typeof payload.token !== "string") {
    throw new ShareClientError("SHARE_EMPTY_RESPONSE", "Share resolve returned an invalid response", response.status);
  }

  return {
    token: payload.token,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : null
  };
};
