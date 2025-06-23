import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createBooking = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { expertId, date, time, sessionDuration, sessionDetails, amount } = req.body;

    if (!expertId || !date || !time || !sessionDuration || !sessionDetails || !amount) {
      res.status(400).json({
        success: false,
        message: "All booking details are required",
      });
      return;
    }

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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata: {
        bookingId: booking.id,
        studentId: userId!,
        expertId,
      },
    });

    console.log("paymentIntent: ", paymentIntent)

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

export const confirmPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      res.status(400).json({
        success: false,
        message: "Payment intent ID required",
      });
      return;
    }

    
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      res.status(400).json({
        success: false,
        message: "Payment not completed",
      });
      return;
    }

    // Update transaction status
    // First, find the transaction by providerId
    const transactionRecord = await prisma.transaction.findFirst({
      where: {
        providerId: paymentIntentId,
      },
      include: {
        booking: true,
      },
    });

    if (!transactionRecord) {
      res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
      return;
    }

    const transaction = await prisma.transaction.update({
      where: {
        id: transactionRecord.id,
      },
      data: {
        status: "SUCCESS",
      },
      include: {
        booking: true,
      },
    });

    res.json({
      success: true,
      message: "Payment confirmed successfully",
      transaction,
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