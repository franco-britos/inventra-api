import { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Factory that returns middleware to validate that the given route params
 * are valid UUIDs. Rejects early with 400 if any param is malformed,
 * preventing invalid data from reaching the database layer.
 */
export function validateUUIDParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = req.params[name] as string | undefined;
      if (!value || !UUID_REGEX.test(value)) {
        res.status(400).json({ error: `Invalid ${name} — expected a UUID.` });
        return;
      }
    }
    next();
  };
}

/**
 * Safely extract a route param as a string.
 * Use in handlers that run after validateUUIDParams.
 */
export function param(req: Request, name: string): string {
  return req.params[name] as string;
}

/** Format Zod errors into a flat record of field → message */
function formatZodErrors(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    errors[key] = issue.message;
  }
  return errors;
}

/**
 * Validate `req.body` against a Zod schema.
 * On success, replaces `req.body` with the parsed (and typed) value.
 * On failure, returns 400 with structured field-level errors.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: formatZodErrors(result.error) });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate `req.query` against a Zod schema.
 * On success, stores the parsed result on `req.validatedQuery`.
 * On failure, returns 400 with structured field-level errors.
 *
 * Express 5 makes `req.query` a read-only getter, so we cannot
 * overwrite it. Handlers should read from `req.validatedQuery`.
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ errors: formatZodErrors(result.error) });
      return;
    }
    req.validatedQuery = result.data as Record<string, unknown>;
    next();
  };
}
