import { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkRateLimitMock, sendParserImprovementEmailMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  sendParserImprovementEmailMock: vi.fn(async () => undefined)
}));

vi.mock("../claude/rateLimit.js", () => ({
  checkRateLimit: checkRateLimitMock
}));

vi.mock("../_lib/parserImprovementEmail.js", () => ({
  sendParserImprovementEmail: sendParserImprovementEmailMock
}));

import parserImprovementHandler from "../parser-improvement/submit";

interface MockResponseResult {
  res: ServerResponse;
  headers: Record<string, string>;
  readBody: () => string;
}

const createMockResponse = (): MockResponseResult => {
  const headers: Record<string, string> = {};
  let body = "";
  const res = {
    statusCode: 0,
    writableEnded: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        body += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        body += chunk.toString("utf8");
      }
      (this as { writableEnded: boolean }).writableEnded = true;
      return this;
    }
  } as unknown as ServerResponse;

  return {
    res,
    headers,
    readBody: () => body
  };
};

const createMultipartRequest = async (params: {
  formData: FormData;
  method?: "POST" | "GET";
  ip?: string;
}): Promise<IncomingMessage> => {
  const method = params.method ?? "POST";
  const request =
    method === "GET"
      ? new Request("http://localhost/api/parser-improvement/submit", { method })
      : new Request("http://localhost/api/parser-improvement/submit", {
          method,
          body: params.formData
        });
  const rawBody = Buffer.from(await request.arrayBuffer());
  const contentType = request.headers.get("content-type") ?? "";
  const ip = params.ip ?? "203.0.113.10";

  return {
    method,
    headers: {
      "content-type": contentType,
      "x-forwarded-for": ip
    },
    socket: {
      remoteAddress: ip
    },
    async *[Symbol.asyncIterator]() {
      if (rawBody.length > 0) {
        yield rawBody;
      }
    }
  } as unknown as IncomingMessage;
};

const makePdfFile = (size = 16): File => {
  const header = Buffer.from("%PDF-1.4\n");
  const filler = Buffer.alloc(Math.max(0, size - header.length), 65);
  return new File([Buffer.concat([header, filler])], "sample.pdf", { type: "application/pdf" });
};

describe("/api/parser-improvement/submit", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000
    });
    sendParserImprovementEmailMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 405 for non-POST requests", async () => {
    const formData = new FormData();
    const req = await createMultipartRequest({ formData, method: "GET" });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(405);
  });

  it("returns 400 when consent is missing", async () => {
    const formData = new FormData();
    formData.append("file", makePdfFile());

    const req = await createMultipartRequest({ formData });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(400);
    expect(JSON.parse(res.readBody()).error.code).toBe("CONSENT_REQUIRED");
  });

  it("returns 400 for invalid PDFs", async () => {
    const formData = new FormData();
    formData.append("consent", "true");
    formData.append("file", new File(["hello world"], "sample.txt", { type: "text/plain" }));

    const req = await createMultipartRequest({ formData });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(400);
    expect(JSON.parse(res.readBody()).error.code).toBe("INVALID_PDF");
  });

  it("returns 413 for oversized uploads", async () => {
    const formData = new FormData();
    formData.append("consent", "true");
    formData.append("file", makePdfFile(15 * 1024 * 1024 + 2048));

    const req = await createMultipartRequest({ formData });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(413);
    expect(JSON.parse(res.readBody()).error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000
    });

    const formData = new FormData();
    formData.append("consent", "true");
    formData.append("file", makePdfFile());

    const req = await createMultipartRequest({ formData });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(429);
    expect(JSON.parse(res.readBody()).error.code).toBe("RATE_LIMITED");
  });

  it("returns 200 and forwards sanitized metadata to the email helper", async () => {
    const formData = new FormData();
    formData.append("consent", "true");
    formData.append("file", makePdfFile());
    formData.append("sourceFileName", " poor-scan.pdf ");
    formData.append("confidence", "0.42");
    formData.append("unitCoverage", "0.10");
    formData.append("markerCount", "2");
    formData.append("warningCodes", JSON.stringify(["PDF_UNKNOWN_LAYOUT"]));
    formData.append("uncertaintyReasons", JSON.stringify(["confidence_very_low"]));
    formData.append("extractionRoute", "local-ocr");
    formData.append("pageCount", "3");
    formData.append("debugSummary", "pages=3 | ocrUsed=yes");
    formData.append("country", "Netherlands");
    formData.append("labProvider", "Example Lab");
    formData.append("language", "Dutch");
    formData.append("note", "Parser missed most rows.");

    const req = await createMultipartRequest({ formData });
    const res = createMockResponse();

    await parserImprovementHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    expect(sendParserImprovementEmailMock).toHaveBeenCalledTimes(1);
    expect(sendParserImprovementEmailMock.mock.calls[0]?.[0]).toMatchObject({
      fileName: "sample.pdf",
      sourceFileName: "poor-scan.pdf",
      confidence: 0.42,
      unitCoverage: 0.1,
      markerCount: 2,
      warningCodes: ["PDF_UNKNOWN_LAYOUT"],
      uncertaintyReasons: ["confidence_very_low"],
      extractionRoute: "local-ocr",
      pageCount: 3,
      country: "Netherlands",
      labProvider: "Example Lab",
      language: "Dutch",
      note: "Parser missed most rows."
    });
  });
});
