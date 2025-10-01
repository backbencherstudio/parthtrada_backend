import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-08-27.basil' });

const secret = process.env.STRIPE_WEBHOOK_SECRET

export const handleWebhook = (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret!);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                break;
            case 'payment_method.attached':
                const paymentMethod = event.data.object;
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
