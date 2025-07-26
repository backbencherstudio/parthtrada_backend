import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { getExperts, getExpertById } from './home.controllers';


const router = Router();

// Home Page routes
router.get("/getExperts", verifyUser("STUDENT"), getExperts);
router.get("/getExpert/:id", verifyUser("STUDENT"), getExpertById);


export default router;