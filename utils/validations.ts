import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  profile: z.any().optional()
});

export const bookingSchema = z.object({
  expertId: z.string().min(1, { error: 'Expert ID is required.' }),
  date: z
    .string()
    .min(1, { error: 'Date is required.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  time: z
    .string()
    .min(1, { error: "Date is required." })
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:mm format"),
  sessionDuration: z.number(),
  sessionDetails: z.string().optional(),
  amount: z.number()
});


export const savePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, { error: 'Payment Method ID is required.' }),
  customerId: z.string().min(1, { error: 'Customer ID is required.' }),
});

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, { error: 'Payment Intent ID is required.' }),
  paymentMethodId: z.string().min(1, { error: 'Payment Method ID is required.' }),
});

export const refundTransactionSchema = z.object({
  bookingId: z.string().min(1, { error: 'Booking ID is required.' }),
  reason: z.string().optional(),
});


export const payoutsSchema = z.object({
  amount: z.number(),
});

export const messageSchema = z.object({
  message: z.string().min(1, { error: 'Message cannot be empty.' })
})