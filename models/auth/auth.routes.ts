import { Router } from 'express';
import { linkedinCallback, updateUser } from './auth.controllers';
import { verifyUser } from '../../middleware/verifyUsers';
import upload from "../../config/multer.config";

const router = Router();


router.get('/linkedin/callback', linkedinCallback);

router.put('/update', verifyUser('ANY'), upload.single("image"),  updateUser);

export default router;
