import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export const savePaymentMethod = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { paymentMethodId, customerId } = req.body
        const userId = req?.user?.id || 'cmf68colv0001vcd4tt6jr4lr';

        await prisma.paymentMethod.create({
            data: {
                stripePaymentMethodId: paymentMethodId,
                userId,
                customerID: customerId
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
    const { paymentIntentId, paymentMethodId } = req.body;
    const userId = req.user?.id;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID required",
      });
    }
    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Payment paymentMethodId is required",
      });
    }

    // Verify the booking belongs to this user
    const transaction = await prisma.transaction.findFirst({
      where: {
        providerId: paymentIntentId,
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
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        const paymentMethod = await prisma.paymentMethod.findFirst({where: {stripePaymentMethodId: paymentMethodId}})

        await stripe.paymentIntents.update(paymentIntentId, {customer: paymentMethod.customerID})

        if (paymentIntent.status === "requires_payment_method") {
          // Attach and confirm payment method
          await stripe.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethodId,
            return_url: process.env.FRONTEND_URL,
          });
        }

        // Now retrieve again to check status
        const updatedIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (updatedIntent.status === "requires_capture") {
          await stripe.paymentIntents.capture(paymentIntentId);
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


export const initiateRefund = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId, reason } = req.body;
    const userId = req.user?.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
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
      reason: reason || "requested_by_customer",
      reverse_transfer: true,
      refund_application_fee: true,
    });

    // Update booking and transaction status
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: "REFUNDED" }
      }),
      prisma.transaction.update({
        where: { bookingId },
        data: {
          status: "REFUNDED",
          refundDate: new Date(),
          refundReason: reason
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