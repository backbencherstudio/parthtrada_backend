import z from "zod";

export const bookingsQuerySchema = z.object({
  page: z
    .string()
    .default('1')
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0, { message: 'Page must be greater than 0' }),
  perPage: z
    .string()
    .default('10')
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0, { message: 'PerPage must be greater than 0' }),
})