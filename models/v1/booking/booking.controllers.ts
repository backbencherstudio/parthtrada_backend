import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { expertId, date, time, sessionDuration, sessionDetails, amount } = req.body;

    // Validation
    if (!expertId || !date || !time || !sessionDuration || !sessionDetails || !amount) {
       res.status(400).json({
        success: false,
        message: "All booking details are required",
      });
      return
    }

    // Check if expert has completed Stripe onboarding
    const expert = await prisma.expertProfile.findUnique({
      where: { userId: expertId },
      include: { user: true }
    });

    if (!expert?.stripeAccountId || !expert.isOnboardCompleted) {
       res.status(400).json({
        success: false,
        message: "Expert has not completed payment setup",
      });
      return
    }

    // Create booking record
    const booking = await prisma.booking.create({
      data: {
        studentId: userId,
        expertId,
        date: new Date(date),
        time,
        sessionDuration,
        sessionDetails,
        status: "UPCOMING",
      },
    });

    // Calculate platform fee (10%)
    const platformFee = Math.round(amount * 100 * 0.1);
    const amountInCents = Math.round(amount * 100);

    // Create Stripe PaymentIntent with Connect
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      application_fee_amount: platformFee,
      transfer_data: {
        destination: expert.stripeAccountId,
      },
      metadata: {
        bookingId: booking.id,
        studentId: userId!,
        expertId,
      },
      // Capture later after session completion
      capture_method: "manual",
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        bookingId: booking.id,
        amount,
        currency: "usd",
        provider: "STRIPE",
        providerId: paymentIntent.id,
        status: "PENDING",
      },
    });

    res.json({
      success: true,
      message: "Booking created successfully",
      data: {
        bookingId: booking.id,
        clientSecret: paymentIntent.client_secret,
        amount,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const confirmPayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user?.id;

    if (!paymentIntentId) {
       res.status(400).json({
        success: false,
        message: "Payment intent ID required",
      });
      return
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

    // Capture the payment (only if session is completed)
    if (transaction.booking.status === "COMPLETED") {
      await stripe.paymentIntents.capture(paymentIntentId);
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "SUCCESS" },
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

// Add these new endpoints to your router
export const capturePayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user?.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { transaction: true }
    });

    if (!booking || booking.expertId !== userId) {
       res.status(403).json({
        success: false,
        message: "Unauthorized or booking not found",
      });
      return
    }

    if (booking.status !== "COMPLETED") {
       res.status(400).json({
        success: false,
        message: "Session must be completed before capturing payment",
      });
      return
    }

    // Capture the payment
    await stripe.paymentIntents.capture(booking.transaction?.providerId!);

    // Update transaction status
    await prisma.transaction.update({
      where: { bookingId },
      data: { status: "SUCCESS" }
    });

    res.json({
      success: true,
      message: "Payment captured successfully",
    });
  } catch (error) {
    console.error("Error capturing payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to capture payment",
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

    // Create refund
    const refund = await stripe.refunds.create({
      payment_intent: booking.transaction?.providerId!,
      reason: reason || "requested_by_customer"
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