import { z } from "zod";

export const savePaymentMethodSchema = z.object({
  paymentMethodId: z.string({ error: 'Payment Method ID is required.' }),
  customerId: z.string({ error: 'Customer ID is required.' }),
});

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string({ error: 'Payment Intent ID is required.' }),
  paymentMethodId: z.string({ error: 'Payment Method ID is required.' }),
});

export const refundTransactionSchema = z.object({
  bookingId: z.string({ error: 'Booking ID is required.' }),
  reason: z.string().optional(),
});


export const withdrawTransactionSchema = z.object({
  transactionId: z.string({ error: 'Transaction ID is required.' }),
  withdrawVia: z.string({ error: 'Withdraw Via is required' }),
});
