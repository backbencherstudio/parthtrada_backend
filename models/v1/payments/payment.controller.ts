import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { confirmPaymentSchema, payoutsSchema, refundTransactionSchema, savePaymentMethodSchema } from "@/utils/validations";
import stripe from "@/services/stripe";

const prisma = new PrismaClient();

export const createSetupIntent = async (req: Request, res: Response) => {
  try {
    // const user_id = req.user?.id;
    const user_id = 'cmfqhg38d0000vcewcw00fcwk';
    const user = await prisma.users.findUnique({
      where: {
        id: user_id
      }
    })

    const setup_intent = await stripe.setupIntents.create({
      customer: user.customer_id,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    })

    return res.status(201).json({
      success: true,
      client_secret: setup_intent.client_secret
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create setup intent",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export const addCard = async (req: Request, res: Response) => {
  try {
    const { data, error, success } = savePaymentMethodSchema.safeParse(req.body);
    if (!success) {
      if (!success) {
        return res.status(400).json({
          success: false,
          errors: JSON.parse(error.message).map(err => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
    }

    const userId = 'cmfqhg38d0000vcewcw00fcwk';
    const pm_id = data.paymentMethodId

    const paymentMethod = await stripe.paymentMethods.retrieve(pm_id);

    const payload = {
      provider: data.provider,
      method_id: paymentMethod.id,
      userId,
      brand: paymentMethod.card.brand,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      last4: paymentMethod.card.last4,
    }

    await prisma.paymentMethod.create({
      data: payload
    })

    return res.status(201).json({
      message: 'Payment Method Saved.'
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Something went wrong.' })
  }
}

export const getCards = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req?.user?.id
    const cards = await prisma.paymentMethod.findMany({
      where: {
        userId: user_id
      }
    })
    return res.status(201).json({
      success: true,
      message: 'Cards fetched successfully.',
      data: cards
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to confirm payment",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export const confirmPayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error, success } = confirmPaymentSchema.safeParse(req.body);
    if (!success) {
      if (!success) {
        return res.status(400).json({
          success: false,
          errors: JSON.parse(error.message).map(err => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
    }

    const userId = req.user?.id;

    // Verify the booking belongs to this user
    const transaction = await prisma.transaction.findFirst({
      where: {
        providerId: data.paymentIntentId,
        booking: {
          OR: [
            { studentId: userId },
            { expertId: userId }
          ]
        }
      },
      include: {
        booking: true
      }
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: "Transaction not found or unauthorized",
      });
      return
    }

    let newStatus = transaction.status;
    // Capture the payment
    if (transaction.booking.status === "PENDING") {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId);

        const user = await prisma.users.findUnique({
          where: {
            id: userId
          }
        })

        await stripe.paymentIntents.update(data.paymentIntentId, { customer: user.customer_id })

        if (paymentIntent.status === "requires_payment_method") {
          // Attach and confirm payment method
          await stripe.paymentIntents.confirm(data.paymentIntentId, {
            payment_method: data.paymentMethodId,
            return_url: process.env.FRONTEND_URL,
          });
        }

        // Now retrieve again to check status
        const updatedIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId);

        if (updatedIntent.status === "requires_capture") {
          await stripe.paymentIntents.capture(data.paymentIntentId);
          newStatus = "COMPLETED";
        } else {
          throw new Error(`PaymentIntent not ready to capture. Status: ${updatedIntent.status}`);
        }
      } catch (error) {
        throw new Error(error?.message);
      }
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: newStatus },
      include: { booking: true }
    });

    res.json({
      success: true,
      message: "Payment confirmed successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to confirm payment",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};


export const refundTransaction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error, success } = refundTransactionSchema.safeParse(req.body);
    if (!success) {
      if (!success) {
        return res.status(400).json({
          success: false,
          errors: JSON.parse(error.message).map(err => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
    }

    const userId = req.user?.id;

    const booking = await prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { transaction: true }
    });

    if (!booking || (booking.studentId !== userId && booking.expertId !== userId)) {
      res.status(403).json({
        success: false,
        message: "Unauthorized or booking not found",
      });
      return
    }

    // Create refund (reverse transfer, refund platform fee as well)
    const refund = await stripe.refunds.create({
      payment_intent: booking.transaction?.providerId!,
      reason: 'requested_by_customer',
      reverse_transfer: true,
      refund_application_fee: true,
    });

    // Update booking and transaction status
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: data.bookingId },
        data: { status: "REFUNDED" }
      }),
      prisma.transaction.update({
        where: { bookingId: data.bookingId },
        data: {
          status: "REFUNDED",
          refundDate: new Date(),
          refundReason: data?.reason || 'requested_by_customer'
        }
      })
    ]);

    res.json({
      success: true,
      message: "Refund initiated successfully",
      refundId: refund.id
    });
  } catch (error) {
    console.error("Error initiating refund:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate refund",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};


export const payouts = async (req: AuthenticatedRequest, res: Response) => {
  const { data, error, success } = payoutsSchema.safeParse(req.body);
  if (!success) {
    if (!success) {
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }
  }
  try {
    const userID = req.user?.id
    const expert = await prisma.expertProfile.findFirst({ where: { userId: userID } })

    const stripeAccount = expert?.stripeAccountId

    if (!stripeAccount) {
      res.status(404).json({
        message: 'Please connect your stripe account first'
      })
      return
    }

    await stripe.payouts.create(
      {
        amount: data.amount * 100,
        currency: "usd",
      },
      {
        stripeAccount: stripeAccount
      }
    );


    return res.status(200).json({ message: 'Payout created successfully.', data: {} });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const balance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userID = req.user?.id
    const expert = await prisma.expertProfile.findFirst({ where: { userId: userID } })

    const stripeAccount = expert?.stripeAccountId

    if (!stripeAccount) {
      res.status(404).json({
        message: 'Please connect your stripe account first'
      })
      return
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccount
    });

    res.status(200).json({
      data: balance
    })
    return
  } catch (error) {

  }
}
