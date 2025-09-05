import { z } from "zod";

export const withdrawTransactionSchema = z.object({
  transactionId: z.string({error: 'Transaction ID is required.'}),
  withdrawVia: z.string({error: 'Withdraw Via is required'}),
});
