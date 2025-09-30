import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "@/middleware/verifyUsers";
import fs from 'fs';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createStripeAccount = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    // Check if user is an expert
    const expert = await prisma.expertProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!expert) {
      res.status(400).json({
        success: false,
        message: "Only experts can create payment accounts",
      });
      return;
    }

    // Create Stripe Connect account
    const account = await stripe.accounts.create({
      type: "express",
      email: expert.user.email,
      business_type: "individual",
      individual: {
        email: expert.user.email,
        first_name: expert.user.name?.split(" ")[0],
        last_name: expert.user.name?.split(" ")[1] || "",
      },
      capabilities: {
        transfers: { requested: true },
      },
    });

    // Update expert with Stripe account ID
    await prisma.expertProfile.update({
      where: { userId },
      data: { stripeAccountId: account.id },
    });

    return res.json({
      success: true,
      message: "Stripe account created",
      accountId: account.id,
    });
  } catch (error) {
    console.error("Error creating Stripe account:", error?.message);
    res.status(500).json({
      success: false,
      message: "Failed to create Stripe account",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getOnboardingLink = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    const expert = await prisma.expertProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!expert?.stripeAccountId) {
      res.status(400).json({
        success: false,
        message: "Stripe account not found",
      });
      return;
    }

    const accountLink = await stripe.accountLinks.create({
      account: expert.stripeAccountId,
      refresh_url: `${process.env.FRONTEND_URL}/expert/payment?reauth=true`,
      return_url: `${process.env.FRONTEND_URL}/expert/payment?success=true`,
      type: "account_onboarding",
    });

    res.json({
      success: true,
      url: accountLink.url,
    });
  } catch (error) {
    console.error("Error generating onboarding link:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate onboarding link",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const checkOnboardingStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    const expert = await prisma.expertProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!expert?.stripeAccountId) {
      res.json({
        isOnboarded: false,
        accountId: null,
      });
      return;
    }

    const account = await stripe.accounts.retrieve(expert.stripeAccountId);

    const isOnboardCompleted =
      account.details_submitted && account.charges_enabled;

    // Update expert profile if onboarding is complete
    if (isOnboardCompleted && !expert.isOnboardCompleted) {
      await prisma.expertProfile.update({
        where: { userId },
        data: { isOnboardCompleted: true },
      });
    }

    res.json({
      isOnboarded: isOnboardCompleted,
      accountId: expert.stripeAccountId,
      requirements: account.requirements,
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check onboarding status",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const updateOnboardStatus = async (req: Request, res: Response) => {
  try {
    const account_id = req.params.id
    await prisma.expertProfile.update({
      where: {
        stripeAccountId: account_id
      },
      data: {
        isOnboardCompleted: true
      }
    })
    return res.status(200).json({
      success: true,
      message: 'Status updated.',
      account_id
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Something went wrong.'
    })
  }
}

export const webhook = async (req: Request, res: Response) => {
  let event = req.body;
  switch (event.type) {
    case 'payment_intent.succeeded':
      const data = event.data.object
      console.log(`Payment intent Succeeded ${JSON.stringify(data)}.`);

      break;
    default:
      return
  }

  res.json({ received: true });
}
