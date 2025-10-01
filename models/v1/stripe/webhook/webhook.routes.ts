import express, { Router } from 'express';
import { handleWebhook } from './webhook.controller';

const router = Router();

// Use express.raw for Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

export default router;
