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
  currency: z.string()
});


export const savePaymentMethodSchema = z.object({
  provider: z.string().min(1, { error: 'Provider is required.' }),
  paymentMethodId: z.string().min(1, { error: 'Payment Method ID is required.' }),
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

export const reviewSchema = z.object({
  bookingId: z.string().min(1, { error: 'Booking ID is required.' }),
  rating: z.number().max(5),
  description: z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email({ error: 'Invalid email address.' }).min(1, { error: 'Email is required.' }),
  password: z.string().min(1, { error: 'Password is required.' }),
})

export const registerSchema = z.object({
  name: z.string().min(1, { error: 'Name is required.' }),
  email: z.string().email({ error: 'Invalid email address.' }).min(1, { error: 'Email is required.' }),
  password: z.string({ error: 'Password is required.' }).min(8, { error: 'Password must be at least 8 character.' }),
})


export const verifyLoginSchema = z.object({
  email: z.string().email({ error: 'Invalid email address.' }).min(1, { error: 'Email is required.' }),
  otp: z.string().min(1, { error: 'OTP is required.' }),
})


export const adminProfileSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email({ error: 'Invalid email address.' }).optional(),
});

export const changeExpertStatus = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
