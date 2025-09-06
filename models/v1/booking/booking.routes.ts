import { Router } from 'express';
import { 
  create,
  index,
} from "./booking.controllers";
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router();

// Student Routes
router.post("/", verifyUser("STUDENT"), create);
router.get("/", verifyUser("STUDENT"), index);

// Expert Routes
router.get('/expert', verifyUser('EXPERT'))

export default router;
