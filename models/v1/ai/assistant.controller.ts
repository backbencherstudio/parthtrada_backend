import { PrismaClient } from '@prisma/client'
import { Request, Response } from 'express'

const prisma = new PrismaClient()

export const search = async (req: Request, res: Response) => {
    try {
        const search_query = req.query?.q || ''
        const experts = await prisma.expertProfile.findMany()
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    Authorization:
                        'Bearer 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',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek/deepseek-r1:free',
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a helpful assistant answering from the database.'
                        },
                        {
                            role: 'user',
                            content: `
User asked: "${search_query}".
Here are top results from the DB: ${JSON.stringify(experts)}.
Answer clearly using only this information.
      `
                        }
                    ]
                })
            }
        )

        return res.status(200).json({
            success: true,
            message: 'Search result.',
            search_query,
            data: await response.json()
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to search query.',
            error: 'Internal server error'
        })
    }
}
