import { Router } from 'express';
import { linkedinCallback } from './auth.controllers';

const router = Router();

// LinkedIn OAuth routes
router.get('/linkedin/callback', linkedinCallback);


export default router;
