import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { conversations, createConversation, messages, sendMessage } from './conversations.controllers';

const router = Router();

router.use(verifyUser('ANY'))

router.get('/', conversations)
router.post('/', createConversation)
router.post('/messages', sendMessage)
router.get('/messages/:conversation_id', messages)

export default router;
