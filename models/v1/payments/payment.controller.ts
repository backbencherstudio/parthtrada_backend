import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import moment from 'moment-timezone';
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { cardSchema, confirmPaymentSchema, payoutsSchema, refundTransactionSchema } from "@/utils/validations";
import stripe from "@/services/stripe";
import { paginationQuerySchema } from "@/utils/queryValidation";
import { io } from '@/socketServer';

const prisma = new PrismaClient();

export const createCard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req.user?.id
    const user = await prisma.users.findUnique({
      where: {
        id: user_id,
      }
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      })
    }

    const { data: body, error, success } = cardSchema.safeParse(req.body);

    if (!success) {
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }

    const { token } = body;

    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token }
    });

    await stripe.paymentMethods.attach(paymentMethod.id, { customer: user.customer_id });

    let default_card = false
    const payment_methods = await prisma.paymentMethod.findFirst({
      where: {
        userId: user_id
      }
    })

    if (!payment_methods) {
      default_card = true
    }

    const payload = {
      provider: 'stripe',
      userId: user_id,
      brand: paymentMethod.card.brand,
      method_id: paymentMethod.id,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      last4: paymentMethod.card.last4,
      default: default_card
    }

    await prisma.paymentMethod.create({
      data: payload
    })

    return res.status(201).json({
      message: 'Payment Method Saved.',
      paymentMethodId: paymentMethod.id
    })
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export const defaultCard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req.user?.id;
    const id = req.params.id;

    const user = await prisma.users.findUnique({
      where: { id: user_id },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    await prisma.paymentMethod.updateMany({
      where: { userId: user_id, default: true },
      data: { default: false }
    });

    const paymentMethod = await prisma.paymentMethod.update({
      where: { id: id },
      data: { default: true }
    });

    return res.status(200).json({
      message: 'Default card updated.',
      paymentMethodId: paymentMethod.id
    });

  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};


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
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
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
        booking: {
          include: {
            expert: true,
            student: true
          }
        }
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
          const payment_method = await prisma.paymentMethod.findFirst({
            where: {
              userId: userId,
              default: true
            }
          })
          // Attach and confirm payment method
          await stripe.paymentIntents.confirm(data.paymentIntentId, {
            payment_method: payment_method.method_id,
            return_url: process.env.FRONTEND_URL,
          });
        }

        // Now retrieve again to check status
        const updatedIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId);

        if (updatedIntent.status === "requires_capture") {
          await stripe.paymentIntents.capture(data.paymentIntentId);
          newStatus = "COMPLETED";

          const expertTimezone = transaction.booking.expert.timezone;
          const expertLocalTime = moment.utc(transaction.booking.date).tz(expertTimezone)

          const notification_title = transaction.booking.student.name
          const notification_message = `Wants to take your consultation on the ${expertLocalTime}`

          await prisma.notification.create({
            data: {
              image: transaction.booking.student.image,
              title: notification_title,
              message: notification_message,
              type: 'BOOKING_REQUESTED',
              sender_id: transaction.booking.studentId,
              recipientId: transaction.booking.expertId,
              meta: {
                booking_id: transaction.booking.id,
                sessionDetails: transaction.booking.sessionDetails,
                disabled: false,
                texts: ['Decline', 'Accept']
              }
            }
          })

          // Send notification
          io.to(transaction.booking.expertId).emit('received-notification', {
            image: transaction.booking.student.image,
            title: notification_title,
            message: notification_message
          })
        } else {
          throw new Error(`PaymentIntent not ready to capture. Status: ${updatedIntent.status}`);
        }
      } catch (error) {
        throw new Error(error?.message);
      }
    }

    // Update transaction and booking status
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

export const refundReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notification_id = req.params.notification_id
    const user_id = req.user.id
    const notification = await prisma.notification.findUnique({
      where: { id: notification_id, recipientId: user_id },
      select: { meta: true },
    });

    if (!notification) throw new Error("Notification not found");

    const currentMeta = (notification.meta && typeof notification.meta === 'object')
      ? notification.meta
      : {};

    const payload = {
      ...currentMeta,
      disabled: true,
      texts: ['Confirmed'],
    }

    await prisma.notification.update({
      where: { id: notification_id },
      data: {
        meta: payload,
      },
    });
    return res.status(201).json({
      success: true,
      message: 'Refund request reviewed successfully.',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to confirm review refund request.",
      error: "Internal server error",
    });
  }
}

export const transactions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = paginationQuerySchema.safeParse(req.query);
    const user_id = req.user?.id

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

    const user = await prisma.users.findUnique({
      where: {
        id: user_id
      }
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      })
    }

    const user_type = user.activeProfile;
    let transactions = [];
    let total = 0;

    if (user_type === 'STUDENT') {
      total = await prisma.booking.count({
        where: {
          studentId: user_id, transaction: {
            status: { in: ['COMPLETED', 'REFUNDED'] }
          }
        }
      });
      const raw_transactions = await prisma.booking.findMany({
        where: {
          studentId: user_id,
          status: {
            notIn: ['PENDING']
          }
        },
        select: {
          status: true,
          refund_reason: true,
          expert: {
            select: {
              name: true
            }
          },
          transaction: {
            where: {
              status: { in: ['COMPLETED', 'REFUNDED'] }
            },
            select: {
              id: true,
              amount: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        skip,
        take: perPage,
        orderBy: { updatedAt: "desc" },
      })

      transactions = raw_transactions.map(item => ({ ...item.transaction, name: item.expert.name, status: item.transaction.status, refund_reason: item.refund_reason, refunded: item.transaction.status === 'REFUNDED' }))
    } else {
      total = await prisma.booking.count({
        where: {
          expertId: user_id,
          transaction: {
            status: { in: ['COMPLETED', 'REFUNDED'] }
          }
        }
      });
      const raw_transactions = await prisma.booking.findMany({
        where: {
          expertId: user_id,
          transaction: {
            status: { in: ['COMPLETED', 'REFUNDED'] }
          }
        },
        select: {
          refund_reason: true,
          student: {
            select: {
              name: true
            }
          },
          transaction: {
            where: {
              status: { in: ['COMPLETED', 'REFUNDED'] }
            },
            select: {
              id: true,
              status: true,
              amount: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        skip,
        take: perPage,
        orderBy: { updatedAt: "desc" },
      })

      transactions = raw_transactions.map(item => ({ name: item.student.name, refund_reason: item.refund_reason, refunded: item.transaction.status === 'REFUNDED', ...item.transaction }))
    }

    return res.status(200).json({
      success: true,
      message: 'Transactions fetched successfully.',
      data: transactions,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: "Internal server error",
    });
  }
}

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
      error: "Internal server error",
    });
  }
};

export const payouts = async (req: AuthenticatedRequest, res: Response) => {
  const { success, data, error } = payoutsSchema.safeParse(req.body);

  if (!success) {
    return res.status(400).json({
      success: false,
      errors: JSON.parse(error.message).map(err => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }

  try {
    const userID = req.user?.id;
    const expert = await prisma.expertProfile.findFirst({
      where: { userId: userID },
    });

    const stripeAccount = expert?.stripeAccountId;

    if (!stripeAccount) {
      return res.status(404).json({
        success: false,
        message: "Please connect your stripe account first",
      });
    }

    const payout = await stripe.payouts.create(
      {
        amount: data.amount * 100,
        currency: "usd",
      },
      { stripeAccount }
    );

    return res.status(200).json({
      success: true,
      message: "Payout created successfully.",
      data: payout,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Error creating payout",
    });
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
      data: {
        amount: balance.available[0].amount / 100,
        currency: balance.available[0].currency
      }
    })
    return
  } catch (error) {

  }
}
