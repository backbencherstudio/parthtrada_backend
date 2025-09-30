import { verifyUser } from '@/middleware/verifyUsers';
import { Router } from 'express';
import { myProfile, updateProfile, } from './profile.controller';


const router = Router();

router.get("/me", verifyUser("ANY"), myProfile);
router.patch("/me/update", verifyUser("ANY"), updateProfile);

export default router;
