import z from "zod";
import { BookingStatus, Role } from "@prisma/client";

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
    status: z
        .nativeEnum(BookingStatus)
        .optional(),
})

export const expertsQuerySchema = z.object({
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
    name: z.string()
        .optional(),
    skills: z.string()
        .optional(),
})

export const expertScheduleQuerySchema = z.object({
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

export const usersQuerySchema = z.object({
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
    search: z.string()
        .optional(),
    role: z
        .nativeEnum(Role)
        .optional(),
})

export const dashboardExpertsQuerySchema = z.object({
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
    search: z.string()
        .optional(),
    status: z
        .nativeEnum(BookingStatus)
        .nullable()
        .optional(),
    sortBy: z
        .string()
        .optional(),
})

export const sessionsQuerySchema = z.object({
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
    search: z.string()
        .optional(),
    status: z
        .nativeEnum(BookingStatus)
        .nullable()
        .optional(),
})

export const transactionsQuerySchema = z.object({
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
    search: z.string()
        .optional(),
    status: z
        .nativeEnum(BookingStatus)
        .nullable()
        .optional(),
})