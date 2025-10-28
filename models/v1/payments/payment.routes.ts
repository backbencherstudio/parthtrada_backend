import express, { Router } from 'express';
import { balance, confirmPayment, createCard, defaultCard, getCards, payouts, refundRequest, refundReview, refundReviewExpert, refundTransaction, transactions } from './payment.controller';
import { verifyUser } from '@/middleware/verifyUsers';
import { checkOnboardingStatus, createStripeAccount, getOnboardingLink, updateOnboardStatus, webhook } from './stripe.controllers';

const router = Router()

// Common routes
router.get("/transactions", verifyUser("ANY"), transactions);

// Student routes
router.post('/add-card', verifyUser("ANY"), createCard)
router.patch('/cards/default/:id', verifyUser("ANY"), defaultCard)
router.get('/cards', verifyUser('ANY'), getCards)
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);
router.patch('/bookings/:booking_id/refunds/:notification_id/review', verifyUser("ANY"), refundReview)
router.patch('/refund-req/:booking_id', verifyUser("ANY"), refundRequest)
router.patch('/refund/experts/reviews/:booking_id/:notification_id', verifyUser("ANY"), refundReviewExpert)

// expert routes
router.post("/experts/refund/:booking_id", verifyUser("EXPERT"), refundTransaction);
router.get("/experts/balance", verifyUser("ANY"), balance);
router.post("/experts/payouts", verifyUser("EXPERT"), payouts);

// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("EXPERT"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("ANY"), getOnboardingLink);
router.post("/stripe/status", verifyUser("ANY"), checkOnboardingStatus);
router.get('/stripe/account/success/:id', updateOnboardStatus)

// Stripe Webhook
router.post('/webhook', express.raw({ type: 'application/json' }), webhook)

export default router
