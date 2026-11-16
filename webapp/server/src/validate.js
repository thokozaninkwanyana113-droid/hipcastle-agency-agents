import { z } from 'zod';

/** Express middleware: validate req.body against a zod schema. */
export const body = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
    });
  }
  req.body = parsed.data;
  next();
};

export const id = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A web link: only https:// or http:// (rejects javascript:, data:, file: …). */
export const webUrl = () => z.string().trim().max(500).url().refine((v) => /^https?:\/\//i.test(v), { message: 'Use a link starting with https://' });

export { z };
