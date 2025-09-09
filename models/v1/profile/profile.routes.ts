import { verifyUser } from '@/middleware/verifyUsers';
import { Router } from 'express';
import { myProfile } from './profile.controller';


const router = Router();

router.get("/me", verifyUser("ANY"), myProfile);

export default router;
