import { Router } from 'express';
import { verifyUser } from '@/middleware/verifyUsers';
import { handleWebhook } from './zoom.controller';

const router = Router();

router.post('/webhook', handleWebhook)

export default router;
