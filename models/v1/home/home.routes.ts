import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { getExperts, getExpertById, getSchedule, stats } from './home.controllers';

const router = Router();

// Home Page routes
router.get("/getExperts", verifyUser("STUDENT"), getExperts);
router.get("/getExpert/:id", verifyUser("STUDENT"), getExpertById);
router.get('/stats', stats)

// Schedule screen
router.get("/getSchedule", verifyUser("STUDENT"), getSchedule);

export default router;
