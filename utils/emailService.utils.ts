import nodemailer from "nodemailer";

import dotenv from "dotenv";
import {  emailForgotPasswordOTP} from "../constants/email_message";
import { optVerificationMessage } from "../constants/otp_verification_message";


dotenv.config();

export const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> => {
  const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.NODE_MAILER_USER || "",
      pass: process.env.NODE_MAILER_PASSWORD || "",
    },
  });

  const mailOptions = {
    from: `"parthtrada" <tqmhosain@gmail.com>`,
    to,
    subject,
    html: htmlContent,
  };

  await mailTransporter.sendMail(mailOptions);
};
console.log(sendEmail)

export const sendForgotPasswordOTP = async (email: string, otp: string): Promise<void> => {
  console.log(email, otp)
  const htmlContent = emailForgotPasswordOTP(email, otp);
  
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);
};

export const sendVerificationOTP = async (email: string, otp: string): Promise<void> => {
  const htmlContent = optVerificationMessage(email, otp);
  await sendEmail(email, "OTP Code for Admin Login", htmlContent);
};
