import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { confirmPaymentSchema, payoutsSchema, refundTransactionSchema, savePaymentMethodSchema } from "@/utils/validations";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export const savePaymentMethod = async (req: AuthenticatedRequest, res: Response) => {
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

    const userId = req?.user?.id || 'cmf7vvg1q0000vc8okiad3mx0';

    await prisma.paymentMethod.create({
      data: {
        stripePaymentMethodId: data.paymentMethodId,
        userId,
        customerID: data.customerId
      }
    })

    return res.status(201).json({
      message: 'Payment Method Saved.'
    })
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong.' })
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

        const paymentMethod = await prisma.paymentMethod.findFirst({ where: { stripePaymentMethodId: data.paymentMethodId } })

        await stripe.paymentIntents.update(data.paymentIntentId, { customer: paymentMethod.customerID })

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
