import { Router } from 'express';
import { linkedinCallback, updateUser } from './auth.controllers';
import { verifyUser } from '../../middleware/verifyUsers';

const router = Router();


router.get('/linkedin/callback', linkedinCallback);

router.put('/update', verifyUser('ANY'), updateUser);

export default router;
