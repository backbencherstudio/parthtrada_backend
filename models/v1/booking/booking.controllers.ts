import type { Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";
import moment from 'moment-timezone'
import { createZoomMeeting } from '../../../utils/zoom.utils'

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});


export const createTransaction = async (req: AuthenticatedRequest, res: Response) => {
  const { userId, expertId, amount, withdrawVia } = req.body; // Assuming these values come from the request

  try {
    // Step 1: Create payment intent if Stripe is chosen
    let paymentIntent;
    if (withdrawVia === 'STRIPE') {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Stripe works in cents
        currency: 'usd',
      });
    }

    // Step 2: Save transaction in the database
    const transaction = await prisma.transaction.create({
      data: {
        //@ts-ignore
        userId: userId!, 
        storeId: expertId,
        amount,
        currency: 'USD',
        status: 'PENDING', // The transaction is pending until payment is confirmed
        withdrawVia,
        referenceNumber: paymentIntent?.id, // Only set if Stripe is used
      },
    });

    return res.status(200).json({ transaction });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};


export const withdrawTransaction = async (req: AuthenticatedRequest, res: Response) => {
  const { transactionId, withdrawVia } = req.body; // transactionId and withdrawVia (bank/Stripe)

  try {
    // Get the transaction
    const transaction = await prisma.transaction.findUnique({
      where: {
        id: transactionId,
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (withdrawVia === 'STRIPE') {
      // Step 1: Process withdrawal to Stripe
      const payout = await stripe.payouts.create({
        amount: Number(transaction.amount) * 100, // Convert to cents
        currency: 'usd',
        destination: transaction.providerId, // Expert's Stripe account ID
      });

      // Step 2: Update transaction status to 'completed'
      await prisma.transaction.update({
        where: {
          id: transactionId,
        },
        data: {
          //@ts-ignore
          status: 'COMPLETED',
          referenceNumber: payout.id, // Store payout reference number
        },
      });

      return res.status(200).json({ message: 'Withdrawal processed successfully' });
    }

    if (withdrawVia === 'BANK') {
      // Bank withdrawal (similar logic, but process via bank)
      // Assuming you have a bank integration to handle this
      await prisma.transaction.update({
        where: {
          id: transactionId,
        },
        data: {
          //@ts-ignore
          status: 'COMPLETED', 
        },
      });

      return res.status(200).json({ message: 'Withdrawal processed successfully' });
    }

    return res.status(400).json({ error: 'Invalid withdrawal method' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const refundTransaction = async (req: AuthenticatedRequest, res: Response) => {
  const { transactionId, refundReason } = req.body;

  try {
    const transaction = await prisma.transaction.findUnique({
      where: {
        id: transactionId,
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Step 1: Process refund via Stripe if the transaction is made via Stripe
    if (transaction.provider === 'STRIPE' && transaction.providerId) {   
      const refund = await stripe.refunds.create({
        payment_intent: transaction.providerId,
      });

      // Step 2: Update the transaction with refund info
      await prisma.transaction.update({
        where: {
          id: transactionId,
        },
        data: {
          status: 'REFUNDED', //@ts-ignore
          refundDate: new Date(),
          refundReason,
        },
      });

      return res.status(200).json({ message: 'Refund processed successfully' });
    }

    return res.status(400).json({ error: 'Refund cannot be processed' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};




export const  createBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    // console.log(userId)
    const { expertId, date, time, sessionDuration, sessionDetails, amount } = req.body;
    // Validation
    if (!expertId || !date || !time || !sessionDuration || !sessionDetails || !amount) {
      res.status(400).json({
        success: false,
        message: "All booking details are required",
      });
      return
    }
    // console.log("body",expertId)

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
      return;
    }
        
    // get the student user details
    const student = await prisma.user.findUnique({
        where: { id: userId },
    });
        
     // Combine date and time to create a complete datetime string
    const expertDateTime = `${date} ${time}`;

    // Fetch time-zone strings from the user records (should be valid IANA tz names)
    const expertTimeZone = expert?.user?.timeZone || "UTC";
    const studentTimeZone = student?.timeZone || "UTC";

    // Create a moment object in the expert's time zone
    const expertMoment = moment.tz(expertDateTime, "YYYY-MM-DD hh:mm a", expertTimeZone);

    // Convert the moment to the student's time zone
    const studentMoment = expertMoment.clone().tz(studentTimeZone);

    // Format both timestamps for storage / display
    const formattedExpertTime = expertMoment.format("YYYY-MM-DD HH:mm:ss");
    const formattedStudentTime = studentMoment.format("YYYY-MM-DD HH:mm:ss");

    // console.log(`Expert Time (${expertTimeZone}):`, formattedExpertTime);
    // console.log(`Student Time (${studentTimeZone}):`, formattedStudentTime);
    // 1️⃣ Create Zoom meeting scheduled in expert's timezone
    // let meetingLink: string | undefined;
    // try {
    //   const zoomMeeting = await createZoomMeeting({
    //     topic: `Session with ${student?.name ?? 'Student'}`,
    //     startTime: expertMoment.toDate(),
    //     duration: sessionDuration, // expecting minutes
    //     agenda: typeof sessionDetails === 'string' ? sessionDetails : undefined,
    //     timezone: expertTimeZone,
    //   });
    //   // console.log("meetingLink", zoomMeeting)
    //   meetingLink = zoomMeeting.join_url;
    // } catch (zoomErr) {
    //   // console.error('Failed to create Zoom meeting', zoomErr);
    //   // If Zoom creation fails, we can choose to proceed without it or abort. Here we abort.
    //   res.status(500).json({
    //     success: false,
    //     message: 'Failed to create Zoom meeting',
    //   });
    //   return;
    // }

    // // Create booking record
    const booking = await prisma.booking.create({
      data: {
        studentId: userId,
        expertId,
        date: expertMoment.toDate(),
        expertDateTime: expertMoment.toDate(),
        studentDateTime: studentMoment.toDate(),
        sessionDuration,
        sessionDetails, // Will represent PENDING until enum is fixed
      },
    });
    // console.log("booking", booking)

    // Calculate platform fee (10%)
    const amountInCents = Math.round(amount * 100); // smallest currency unit
    const platformFee = Math.round(amountInCents * 0.1);

    // Create a PaymentIntent that transfers the funds directly to the expert’s account
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      application_fee_amount: platformFee, // 10% platform fee
      transfer_data: {
        destination: expert.stripeAccountId!,
      },
      automatic_payment_methods: { enabled: true },
      capture_method: "manual", // capture after session completion
      metadata: {
        bookingId: booking.id,
        studentId: userId!,
        expertId,
        // meetingLink,
      },
    });

    // Record the transaction in the database
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

    // Respond to the client with the PaymentIntent details so the student can complete payment
    res.json({
      success: true,
      message: "Booking Request sent successfully",
      data: {
        bookingId: booking.id,
        // clientSecret: paymentIntent.client_secret,
        amount,          
        // paymentIntentId: paymentIntent.id, 
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
      data: { status: "COMPLETED" },
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

    // Instant payout to expert (90% net)
    try {
      const expertProfile = await prisma.expertProfile.findUnique({
        where: { userId: booking.expertId },
      });

      if (expertProfile?.stripeAccountId) {
        const netAmountInCents = Math.round(Number(booking.transaction!.amount) * 100 * 0.9);
        await stripe.payouts.create(
          {
            amount: netAmountInCents,
            currency: "usd",
          },
          { stripeAccount: expertProfile.stripeAccountId }
        );
      }
    } catch (payoutErr) {
      console.error("Instant payout failed", payoutErr);
      // We don't fail the whole request if payout fails – funds stay in expert balance
    }

    // Update transaction status
    await prisma.transaction.update({
      where: { bookingId },
      data: { status: "COMPLETED" }
    });

    res.json({
      success: true,
      message: "Payment captured; payout instructed to expert (standard schedule)",
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