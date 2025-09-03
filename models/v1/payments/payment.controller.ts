import { Request, Response } from "express";

export const savePaymentMethod = async (req: Request, res: Response) =>{
    try {
        return res.status(201).json({
            message: 'Created'
        })
    } catch (error) {
        return res.status(500).json({message: 'Something went wrong.'})
    }
}