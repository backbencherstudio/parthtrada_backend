import { AuthenticatedRequest } from '@/middleware/verifyUsers'
import { paginationQuerySchema } from '@/utils/queryValidation'
import { PrismaClient } from '@prisma/client'
import { Response } from 'express'
import { index as notification_index } from '@/utils/notification';

const prisma = new PrismaClient()

export const index = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req.user?.id
    const query = paginationQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: query.error.flatten().fieldErrors
      })
      return
    }

    const { page, perPage } = query.data
    const skip = (page - 1) * perPage

    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: user_id
      },
      skip,
      take: perPage,
      orderBy: {
        created_at: 'desc'
      }
    })

    const total = await prisma.notification.count({
      where: {
        recipientId: user_id
      }
    })

    const results = notification_index(notifications)

    res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully.',
      data: results,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1
      }
    })
  } catch (error) {
    console.error('Failed to fetch notification', error?.message)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications.',
      error: 'Something went wrong.'
    })
  }
}
