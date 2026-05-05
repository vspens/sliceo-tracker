type LogContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function write(level: "info" | "warn" | "error", event: string, context?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(context ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, context?: LogContext) {
  write("info", event, context);
}

export function logWarn(event: string, context?: LogContext) {
  write("warn", event, context);
}

export function logError(event: string, error: unknown, context?: LogContext) {
  write("error", event, {
    ...serializeError(error),
    ...(context ?? {}),
  });
}
