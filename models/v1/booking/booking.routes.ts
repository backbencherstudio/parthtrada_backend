import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { 
  createBooking,
  createTransaction,
  withdrawTransaction,
  refundTransaction
} from "./booking.controllers";

const router = Router();


// Route for creating a payment transaction
router.post('/create-payment', verifyUser("EXPERT"), (req, res, next) => {
  createTransaction(req, res)
    .then(result => {
      // If the controller returns a response, do nothing (it already sent the response)
      // Otherwise, end the response
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Route for withdrawing funds (expert)
router.post('/withdraw', verifyUser("EXPERT"), (req, res, next) => {
  withdrawTransaction(req, res)
    .then(result => {
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Route for refunding a transaction
router.post('/refund', verifyUser("EXPERT"), (req, res, next) => {
  refundTransaction(req, res)
    .then(result => {
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Booking routes
router.post("/create", verifyUser("STUDENT"), createBooking);

export default router;