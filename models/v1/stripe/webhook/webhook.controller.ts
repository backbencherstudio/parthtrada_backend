import stripe from "@/services/stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient()

const secret = process.env.STRIPE_WEBHOOK_SECRET

export const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret!);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('=========event type===========================');
    console.log(event.type);
    console.log('====================================');

    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                break;
            case 'payment_method.attached':
                const paymentMethod = event.data.object;
                break;
            case 'refund.updated':
                const metadata = event.data.object.metadata
                try {
                    const booking = await prisma.booking.findUnique({
                        where: {
                            id: metadata.booking_id
                        },
                        include: {
                            expert: true,
                            student: true
                        }
                    })

                    await prisma.transaction.update({
                        where: {
                            id: metadata?.transaction_id
                        },
                        data: {
                            status: 'REFUNDED'
                        }
                    })

                    await prisma.notification.create({
                        data: {
                            type: 'REFUND_REVIEW',
                            image: booking.expert.image,
                            title: booking.expert.name,
                            message: 'Expert marked the refund as sent. Dit it reach you?',
                            sender_id: booking.expert.id,
                            recipientId: booking.student.id,
                            meta: {
                                booking_id: booking.id,
                                sessionDetails: null,
                                disabled: false,
                                texts: ['Confirm Received'],
                            }
                        }
                    })
                } catch (error) {
                }
                break;
            case 'payout.created':
                console.log('================payout.created====================');
                console.log(event.data.object);
                console.log('====================================');
                break;
            default:
                console.log('=================================================================================');
                console.log(console.log(`Unhandled event type ${event.type}`));
                console.log('=================================================================================');
        }
        return { received: true };
    } catch (error) {
        return res.status(201).json({ received: true, success: false, message: 'Internal server error.' })
    }
}
