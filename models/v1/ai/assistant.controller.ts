import { PrismaClient } from '@prisma/client'
import { Request, Response } from 'express'
import AIRequest from '@/services/aiService'

const format_data = (text: string) => {
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const prisma = new PrismaClient()

export const search = async (req: Request, res: Response) => {
    try {
        const search_query = req.query?.q || ''
        const experts = await prisma.expertProfile.findMany()

        const prompt = `
User asked: "${search_query}".
Here are top results from DB: ${JSON.stringify(experts)}.

Return a JSON array of the most relevant experts based on the user query.
Each object must follow this structure:
[
      {
            "id": string,
            "profession": string,
            "organization": string,
            "location": string,
            "description": string,
            "experience": string,
            "hourlyRate": number,
            "skills": string[],
            "availableDays": string[],
            "availableTime": string[],
            "status": string,
            "stripeAccountId": string,
            "isOnboardCompleted": boolean,
            "userId": string
        }
]
Only return valid JSON — no explanations.
`;

        const ai_response = await AIRequest(prompt)

        if (!ai_response) return [];

        return res.status(200).json({
            success: true,
            message: 'Search result.',
            data: format_data(ai_response),
        })
    } catch (error) {
        console.log('===========error=========================');
        console.log(error?.message);
        console.log('====================================');
        res.status(500).json({
            success: false,
            message: 'Failed to search query.',
            error: 'Internal server error'
        })
    }
}
