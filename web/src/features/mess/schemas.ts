import { z } from "zod";
import { parseMealsToCenti, parseTakaToPaisa } from "./money";

/** Optional taka amount typed as text ("" allowed). Messages are "v:<key>" (see mess.validation). */
export const optionalTaka = z.string().refine((v) => v.trim() === "" || parseTakaToPaisa(v) !== null, "v:invalidAmount");

/** Required taka amount. */
export const requiredTaka = z.string().refine((v) => parseTakaToPaisa(v) !== null, "v:invalidAmount");

export const optionalMeals = z.string().refine((v) => v.trim() === "" || parseMealsToCenti(v) !== null, "v:invalidMeals");

export const requiredMeals = z.string().refine((v) => parseMealsToCenti(v) !== null, "v:invalidMeals");

export const requiredName = z.string().trim().min(1, "v:required").max(100, "v:tooLong");

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "v:invalidDate");

export const balanceDirection = z.enum(["owes", "credit"]);

export const integerInRange = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "v:invalidNumber")
    .refine((v) => Number(v) >= min && Number(v) <= max, `v:range_${min}_${max}`);
