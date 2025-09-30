import { io } from '@/socketServer';

type Notification = {
    title: string
    description?: string
}

export class NotificationService {
    sendMessage(recipient_id: string, payload: Notification) {
        io.to(recipient_id).emit('new_message', payload)
    }
}
