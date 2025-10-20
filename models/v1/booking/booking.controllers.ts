import type { Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "@/middleware/verifyUsers";
import moment from 'moment-timezone'
import { bookingSchema } from "@/utils/validations";
import { bookingsQuerySchema, paginationQuerySchema, scheduleQuerySchema } from "@/utils/queryValidation";
import calculateSlotAmount from "@/utils/calculate-slot-amount";
import serializeBigInt from "@/utils/serializeBigInt";

const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export const create = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data, error, success } = bookingSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }

    if (userId === data.expertId) {
      return res.status(400).json({
        success: false,
        message: "You cannot create a booking for yourself.",
      })
    }

    // Check if expert has completed Stripe onboarding
    const expert = await prisma.expertProfile.findUnique({
      where: { userId: data.expertId },
      include: { user: true }
    });
    if (!expert?.stripeAccountId || !expert.isOnboardCompleted) {
      res.status(400).json({
        success: false,
        message: "Expert has not completed payment setup",
      });
      return;
    }

    const student = await prisma.users.findUnique({
      where: { id: userId },
    });

    const timezone = student.timezone || "UTC";

    let localDateTime;
    if (timezone.toUpperCase() === "UTC") {
      localDateTime = moment.utc(`${data.date} ${data.time}`, "YYYY-MM-DD HH:mm");
    } else {
      localDateTime = moment.tz(`${data.date} ${data.time}`, "YYYY-MM-DD HH:mm", timezone);
    }

    // Convert to UTC (for storing in DB)
    const utcDateTime = localDateTime.clone().utc().toDate();

    const booking = await prisma.booking.create({
      data: {
        studentId: userId,
        expertId: data.expertId,
        date: utcDateTime,
        sessionDuration: data.sessionDuration,
        sessionDetails: data.sessionDetails,
      },
      include: {
        student: true
      }
    });

    const amount = Number(calculateSlotAmount(expert.hourlyRate, data.sessionDuration).toFixed(2))
    const amountInCents = Math.round(amount * 100);
    const platformFee = Math.round(amountInCents * 0.1);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: data.currency,
      customer: student.customer_id,
      application_fee_amount: platformFee,
      transfer_data: {
        destination: expert.stripeAccountId
      },
      automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
      capture_method: 'manual',
      receipt_email: booking.student.email,
      metadata: {
        bookingId: booking.id,
        studentId: userId!,
        expertId: data.expertId,
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userId,
        bookingId: booking.id,
        amount: amount,
        type: 'order',
        currency: data.currency,
        provider: "STRIPE",
        providerId: paymentIntent.id,
        status: "PENDING",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Booking Request sent successfully",
      data: {
        bookingId: booking.id,
        amount: amount,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const index = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const studentID = req.user?.id;

  const result = bookingsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: result.error.flatten().fieldErrors,
    });
    return
  }

  const { page, perPage, status } = result.data;
  const skip = (page - 1) * perPage;

  try {
    const where: Prisma.BookingWhereInput = {
      studentId: studentID,
      ...(status ? { status } : {}),
    };

    const total = await prisma.booking.count({ where });

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        review: {
          select: {
            id: true
          }
        }
      },
      skip,
      take: perPage,
      orderBy: { date: "desc" },
    });

    const updatedBookings = bookings.map(booking => ({
      ...booking,
      should_review: booking.status === "COMPLETED" && !booking.review,
      should_refund: booking.status === 'CANCELLED'
    }));

    res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      data: updatedBookings,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    });
    return
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get bookings.",
      error: "Internal server error",
    });
  }
};

export const cancelBooking = async (req: AuthenticatedRequest,
  res: Response): Promise<any> => {
  try {
    const booking_id = req.params.id
    const student_id = req.user?.id
    const booking = await prisma.booking.findUnique({
      where: {
        id: booking_id,
        studentId: student_id
      },
      select: {
        id: true,
        status: true,
        transaction: {
          select: {
            amount: true,
            status: true
          }
        }
      }
    })

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found.'
      })
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "This booking is already cancelled."
      });
    }

    if (booking.transaction?.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "You can only cancel bookings with a completed transaction."
      });
    }

    const updated_data = await prisma.booking.update({
      where: {
        id: booking_id,
      },
      data: {
        status: "CANCELLED",
        refund_reason: "Cancelled the meeting."
      }
    });

    await prisma.transaction.create({
      data: {
        userId: student_id,
        amount: booking.transaction.amount,
        type: 'refund-request',
        currency: 'usd',
        provider: "STRIPE",
        providerId: booking.id,
        status: "PENDING",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully.",
      data: updated_data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking.",
      error: "Internal server error.",
    });
  }
}

export const pastCallStudent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = paginationQuerySchema.safeParse(req.query);
    const user_id = req.user.id

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage } = query.data;
    const skip = (page - 1) * perPage;

    const where: any = {
      studentId: user_id,
      status: 'COMPLETED'
    }

    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          expert: {
            select: {
              name: true,
            }
          },
          transaction: {
            select: {
              amount: true
            }
          }
        },
        skip,
        take: perPage,
        orderBy: { date: "desc" },
      }),
      prisma.booking.count({ where })
    ])

    const filteredData = data.map(item => ({
      id: item.id,
      name: item.expert.name,
      duration: item.sessionDuration,
      date: item.date,
      amount: item.transaction.amount,
    }));


    res.status(200).json({
      success: true,
      message: "Past call fetched successfully",
      data: filteredData,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get bookings.",
      error: "Internal server error",
    });
  }
}

export const bookingRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = paginationQuerySchema.safeParse(req.query);
    const user_id = req.user.id

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage } = query.data;
    const skip = (page - 1) * perPage;

    const where: any = {
      studentId: user_id,
      status: 'PENDING',
      transaction: {
        status: 'COMPLETED'
      }
    }

    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          expert: {
            select: {
              name: true,
              image: true,
              expertProfile: {
                select: {
                  description: true
                }
              }
            }
          },
        },
        skip,
        take: perPage,
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where })
    ])

    const filteredData = data.map(item => ({
      id: item.id,
      name: item.expert.name,
      image: item.expert.image,
      description: item.expert.expertProfile.description,
      duration: item.sessionDuration,
      date: item.date,
    }));


    res.status(200).json({
      success: true,
      message: "Booking request fetched successfully",
      data: filteredData,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get bookings.",
      error: "Internal server error",
    });
  }
}

export const expertIndex = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const expertID = req.user?.id;

    const query = scheduleQuerySchema.safeParse(req.query);

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage } = query.data;
    const skip = (page - 1) * perPage;

    const where: Prisma.BookingWhereInput = {
      expertId: expertID,
    };

    const total = await prisma.booking.count({
      where: {
        ...where,
        status: { in: ['PENDING', 'UPCOMING'] }
      },
    });

    const bookings = await prisma.booking.findMany({
      where: {
        ...where,
        status: { in: ['PENDING', 'UPCOMING'] },
      },
      skip,
      take: perPage,
      orderBy: { updatedAt: "desc" },
    });
    const notifications = [];
    for (const booking of bookings) {
      const notification = await prisma.notification.findFirst({
        where: {
          AND: [
            { meta: { path: ['booking_id'], equals: booking.id } },
            { meta: { path: ['disabled'], equals: false } },
          ],
        },
      });

      if (notification) {
        notifications.push({
          bookingId: booking.id,
          notification,
        });
      }
    }


    const merged = bookings.map((booking) => {
      const notification = notifications.find((n) => n.bookingId === booking.id);
      return {
        ...booking,
        notification_id: notification?.notification?.id || null,
      };
    });

    const modified = merged.map(booking => ({
      ...booking,
      review: null,
      should_review: null,
      should_refund: null
    }));

    res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      data: serializeBigInt(modified),
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    });
    return
  } catch (error) {
    console.log('=============err from expert sc=======================');
    console.log(error?.message);
    console.log('====================================');
    res.status(500).json({
      success: false,
      message: "Failed to get bookings.",
      error: "Internal server error",
    });
    return
  }
}

// Add these new endpoints to your router
export const capturePayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = req.body?.bookingId
    const userId = req.user?.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required.'
      })
    }

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
            payout_method: 'card'
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
