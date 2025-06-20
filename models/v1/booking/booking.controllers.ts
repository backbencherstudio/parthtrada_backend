import type { Request, Response } from "express"
import { PrismaClient } from "@prisma/client"
import Stripe from "stripe"
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers"
import { getImageUrl } from "../../../utils/base_utl"

const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export const getAvailableExperts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { day, time, skills } = req.query

    const skillsArray = skills ? (skills as string).split(",") : undefined

    const experts = await prisma.user.findMany({
      where: {
        activeProfile: "EXPERT",
        expertProfile: {
          is: {
            ...(day && {
              availableDays: {
                has: day as string,
              },
            }),
            ...(time && {
              availableTime: {
                has: time as string,
              },
            }),
            ...(skillsArray &&
              skillsArray.length > 0 && {
                skills: {
                  hasSome: skillsArray,
                },
              }),
          },
        },
      },
      include: {
        expertProfile: true,
      },
    })

    const availableExperts = experts.map((expert) => ({
      id: expert.id,
      name: expert.name,
      image: expert.image ? getImageUrl(`/uploads/${expert.image}`) : null,
      profession: expert.expertProfile?.profession,
      organization: expert.expertProfile?.organization,
      location: expert.expertProfile?.location,
      description: expert.expertProfile?.description,
      experience: expert.expertProfile?.experience,
      hourlyRate: expert.expertProfile?.hourlyRate,
      skills: expert.expertProfile?.skills || [],
      availableDays: expert.expertProfile?.availableDays || [],
      availableTime: expert.expertProfile?.availableTime || [],
    }))

    res.json({
      success: true,
      experts: availableExperts,
    })
  } catch (error) {
    console.error("Error fetching available experts:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch available experts",
      error: error instanceof Error ? error.message : "Internal server error",
    })
  }
}

export const createBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id
    const { expertId, date, time, sessionDuration, sessionDetails } = req.body

    // Validate required fields
    if (!expertId || !date || !time || !sessionDuration || !sessionDetails) {
      res.status(400).json({
        success: false,
        message: "All booking details are required",
      })
      return
    }

    // Validate sessionDetails structure
    if (!sessionDetails.topic || !sessionDetails.meetingType) {
      res.status(400).json({
        success: false,
        message: "Session topic and meeting type are required",
      })
      return
    }

    // Check if expert exists and is available
    const expert = await prisma.user.findFirst({
      where: {
        id: expertId,
        activeProfile: "EXPERT",
        expertProfile: {
          isNot: null,
        },
      },
      include: {
        expertProfile: true,
      },
    })

    if (!expert || !expert.expertProfile) {
      res.status(404).json({
        success: false,
        message: "Expert not found",
      })
      return
    }

    // Check availability
    const bookingDate = new Date(date)
    const dayOfWeek = bookingDate.toLocaleDateString("en-US", { weekday: "long" })

    if (!expert.expertProfile.availableDays.includes(dayOfWeek)) {
      res.status(400).json({
        success: false,
        message: "Expert not available on this day",
      })
      return
    }

    if (!expert.expertProfile.availableTime.includes(time)) {
      res.status(400).json({
        success: false,
        message: "Expert not available at this time",
      })
      return
    }

    // Check for existing bookings at the same time
    const existingBooking = await prisma.booking.findFirst({
      where: {
        expertId,
        date: bookingDate,
        time,
        status: {
          in: ["UPCOMING", "COMPLETED"],
        },
      },
    })

    if (existingBooking) {
      res.status(400).json({
        success: false,
        message: "This time slot is already booked",
      })
      return
    }

    // Calculate amount
    const hourlyRate = Number.parseFloat(expert.expertProfile.hourlyRate || "0")
    const amount = (hourlyRate * sessionDuration) / 60 // sessionDuration in minutes

    if (amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid hourly rate or session duration",
      })
      return
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        studentId: userId,
        expertId,
        date: bookingDate,
        time,
        sessionDuration,
        sessionDetails,
        status: "UPCOMING",
      },
    })

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        bookingId: booking.id,
        studentId: userId!,
        expertId,
      },
    })

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
    })

    res.json({
      success: true,
      message: "Booking created successfully",
      data: {
        bookingId: booking.id,
        clientSecret: paymentIntent.client_secret,
        amount,
        paymentIntentId: paymentIntent.id,
      },
    })
  } catch (error) {
    console.error("Error creating booking:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error instanceof Error ? error.message : "Internal server error",
    })
  }
}

export const confirmPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentIntentId } = req.body

    if (!paymentIntentId) {
      res.status(400).json({
        success: false,
        message: "Payment intent ID required",
      })
      return
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== "succeeded") {
      res.status(400).json({
        success: false,
        message: "Payment not completed",
      })
      return
    }

    // Update transaction status
    const transaction = await prisma.transaction.findFirst({
      where: {
        providerId: paymentIntentId,
      },
      include: {
        booking: true,
      },
    })

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: "Transaction not found",
      })
      return
    }

    // Update transaction and booking
    await prisma.transaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "SUCCESS",
      },
    })

    const updatedBooking = await prisma.booking.update({
      where: {
        id: transaction.bookingId!,
      },
      data: {
        status: "UPCOMING",
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        expert: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Create notifications
    await prisma.notification.createMany({
      data: [
        {
          title: "Booking Confirmed",
          message: `Your session with ${updatedBooking.expert?.name} has been confirmed for ${updatedBooking.date.toDateString()} at ${updatedBooking.time}`,
          type: "BOOKING_CONFIRMED",
          recipientId: updatedBooking.studentId!,
        },
        {
          title: "New Booking",
          message: `You have a new session booked by ${updatedBooking.student?.name} for ${updatedBooking.date.toDateString()} at ${updatedBooking.time}`,
          type: "BOOKING_CONFIRMED",
          recipientId: updatedBooking.expertId!,
        },
      ],
    })

    res.json({
      success: true,
      message: "Payment confirmed and booking updated",
      booking: {
        id: updatedBooking.id,
        date: updatedBooking.date,
        time: updatedBooking.time,
        status: updatedBooking.status,
        sessionDuration: updatedBooking.sessionDuration,
        sessionDetails: updatedBooking.sessionDetails,
        student: updatedBooking.student,
        expert: updatedBooking.expert,
      },
    })
  } catch (error) {
    console.error("Error confirming payment:", error)
    res.status(500).json({
      success: false,
      message: "Failed to confirm payment",
      error: error instanceof Error ? error.message : "Internal server error",
    })
  }
}

export const getMyBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id
    const activeProfile = req.user?.activeProfile
    const { status } = req.query

    let bookings

    if (activeProfile === "STUDENT") {
      bookings = await prisma.booking.findMany({
        where: {
          studentId: userId,
          ...(status && { status: status as any }),
        },
        include: {
          expert: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
            },
          },
          review: {
            select: {
              id: true,
              rating: true,
              description: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
      })
    } else if (activeProfile === "EXPERT") {
      bookings = await prisma.booking.findMany({
        where: {
          expertId: userId,
          ...(status && { status: status as any }),
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
            },
          },
          review: {
            select: {
              id: true,
              rating: true,
              description: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
      })
    } else {
      res.status(403).json({
        success: false,
        message: "Invalid user role",
      })
      return
    }

    // Format the response with image URLs
    const formattedBookings = bookings.map((booking) => ({
      ...booking,
      expert: booking.expert
        ? {
            ...booking.expert,
            image: booking.expert.image ? getImageUrl(`/uploads/${booking.expert.image}`) : null,
          }
        : null,
      student: booking.student
        ? {
            ...booking.student,
            image: booking.student.image ? getImageUrl(`/uploads/${booking.student.image}`) : null,
          }
        : null,
    }))

    res.json({
      success: true,
      bookings: formattedBookings,
    })
  } catch (error) {
    console.error("Error fetching bookings:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error instanceof Error ? error.message : "Internal server error",
    })
  }
}

export const cancelBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id
    const activeProfile = req.user?.activeProfile
    const { bookingId } = req.params
    const { reason } = req.body

    // Find the booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        student: true,
        expert: true,
        transaction: true,
      },
    })

    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      })
      return
    }

    // Check if user has permission to cancel
    const canCancel =
      (activeProfile === "STUDENT" && booking.studentId === userId) ||
      (activeProfile === "EXPERT" && booking.expertId === userId)

    if (!canCancel) {
      res.status(403).json({
        success: false,
        message: "You don't have permission to cancel this booking",
      })
      return
    }

    // Check if booking can be cancelled (not already completed or cancelled)
    if (booking.status === "COMPLETED" || booking.status === "REFUNDED") {
      res.status(400).json({
        success: false,
        message: "This booking cannot be cancelled",
      })
      return
    }

    // Process refund if payment was successful
    if (booking.transaction && booking.transaction.status === "SUCCESS") {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: booking.transaction.providerId,
          reason: "requested_by_customer",
        })

        // Update transaction with refund info
        await prisma.transaction.update({
          where: { id: booking.transaction.id },
          data: {
            status: "REFUNDED",
            refundDate: new Date(),
            refundReason: reason || "Booking cancelled",
          },
        })
      } catch (stripeError) {
        console.error("Stripe refund error:", stripeError)
        // Continue with booking cancellation even if refund fails
      }
    }

    // Update booking status
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "REFUNDED",
      },
    })

    // Create notifications
    const cancelledBy = activeProfile === "STUDENT" ? "student" : "expert"
    const notificationType =
      activeProfile === "STUDENT" ? "BOOKING_CANCELLED_BY_STUDENT" : "BOOKING_CANCELLED_BY_EXPERT"

    await prisma.notification.createMany({
      data: [
        // Notification to the other party
        {
          title: "Booking Cancelled",
          message: `Your session scheduled for ${booking.date.toDateString()} at ${booking.time} has been cancelled by the ${cancelledBy}`,
          type: notificationType,
          recipientId: activeProfile === "STUDENT" ? booking.expertId! : booking.studentId!,
        },
        // Confirmation notification to the canceller
        {
          title: "Booking Cancelled",
          message: `You have successfully cancelled your session scheduled for ${booking.date.toDateString()} at ${booking.time}`,
          type: notificationType,
          recipientId: userId!,
        },
      ],
    })

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      booking: updatedBooking,
    })
  } catch (error) {
    console.error("Error cancelling booking:", error)
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error instanceof Error ? error.message : "Internal server error",
    })
  }
}


