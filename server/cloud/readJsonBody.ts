import { IncomingMessage } from "node:http";

interface ReadJsonBodyOptions {
  maxBytes: number;
  timeoutMs: number;
}

const parseRawJson = <T>(raw: string): T => {
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const readBodyProperty = <T>(req: IncomingMessage): T | null => {
  const possibleBody = (req as IncomingMessage & { body?: unknown }).body;
  if (possibleBody === undefined || possibleBody === null) {
    return null;
  }

  if (typeof possibleBody === "string") {
    return parseRawJson<T>(possibleBody);
  }

  if (Buffer.isBuffer(possibleBody)) {
    return parseRawJson<T>(possibleBody.toString("utf8"));
  }

  if (typeof possibleBody === "object") {
    return possibleBody as T;
  }

  throw new Error("Invalid JSON body");
};

const toBuffer = (chunk: unknown): Buffer => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk, "utf8");
  }
  return Buffer.from(String(chunk), "utf8");
};

const destroyRequest = (req: IncomingMessage): void => {
  const destroy = (req as IncomingMessage & { destroy?: () => void }).destroy;
  if (typeof destroy === "function") {
    destroy.call(req);
  }
};

const hasAsyncIterator = (req: IncomingMessage): req is IncomingMessage & AsyncIterable<unknown> =>
  typeof (req as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";

const hasEventInterface = (
  req: IncomingMessage
): req is IncomingMessage & {
  on: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
  off?: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
} => typeof (req as { on?: unknown }).on === "function";

const readFromAsyncIterator = async <T>(
  req: IncomingMessage & AsyncIterable<unknown>,
  maxBytes: number
): Promise<T> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = toBuffer(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }

  return parseRawJson<T>(Buffer.concat(chunks).toString("utf8"));
};

const readFromEventInterface = async <T>(
  req: IncomingMessage & {
    on: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
    off?: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => IncomingMessage;
  },
  maxBytes: number
): Promise<T> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    const removeListener = (event: string, listener: (...args: unknown[]) => void) => {
      if (typeof req.off === "function") {
        req.off(event, listener);
        return;
      }
      if (typeof req.removeListener === "function") {
        req.removeListener(event, listener);
      }
    };

    const cleanup = () => {
      removeListener("data", onData);
      removeListener("end", onEnd);
      removeListener("error", onError);
    };

    const onData = (chunk: unknown) => {
      const buffer = toBuffer(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        cleanup();
        reject(new Error("Request body too large"));
        destroyRequest(req);
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      cleanup();
      try {
        resolve(parseRawJson<T>(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    };

    const onError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error("Invalid JSON body"));
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });

export const readJsonBodyWithLimit = async <T>(
  req: IncomingMessage,
  options: ReadJsonBodyOptions
): Promise<T> =>
  new Promise((resolve, reject) => {
    const maxBytes = Math.max(1, Math.round(options.maxBytes));
    const timeoutMs = Math.max(1000, Math.round(options.timeoutMs));
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };

    const timeoutHandle = setTimeout(() => {
      finish(() => reject(new Error("Request body timeout")));
      destroyRequest(req);
    }, timeoutMs);

    const run = async () => {
      const fromBodyProperty = readBodyProperty<T>(req);
      if (fromBodyProperty !== null) {
        finish(() => resolve(fromBodyProperty));
        return;
      }

      if (req.readableEnded) {
        finish(() => resolve({} as T));
        return;
      }

      if (hasAsyncIterator(req)) {
        const parsed = await readFromAsyncIterator<T>(req, maxBytes);
        finish(() => resolve(parsed));
        return;
      }

      if (hasEventInterface(req)) {
        const parsed = await readFromEventInterface<T>(req, maxBytes);
        finish(() => resolve(parsed));
        return;
      }

      throw new Error("Invalid JSON body");
    };

    run().catch((error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error("Invalid JSON body")));
    });
  });
