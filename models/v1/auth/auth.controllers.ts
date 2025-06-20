import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthenticatedRequest } from "../../../middleware/verifyUsers";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { baseUrl, getImageUrl } from "../../../utils/base_utl";

dotenv.config();

const prisma = new PrismaClient();
const LINKEDIN_CONFIG = {
  clientId: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  redirectUri: process.env.LINKEDIN_REDIRECT_URI,
  tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
  userInfoEndpoint: "https://api.linkedin.com/v2/userinfo",
};

const fetchAccessToken = async (code: string) => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: LINKEDIN_CONFIG.clientId,
    client_secret: LINKEDIN_CONFIG.clientSecret,
    redirect_uri: LINKEDIN_CONFIG.redirectUri,
  });

  const response = await fetch(LINKEDIN_CONFIG.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API responded with status: ${response.status}`);
  }

  return await response.json();
};

const fetchUserInfo = async (accessToken: string) => {
  console.log(LINKEDIN_CONFIG);
  const response = await fetch(LINKEDIN_CONFIG.userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API responded with status: ${response.status}`);
  }

  return await response.json();
};

const downloadAndSaveImage = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download image");

    const buffer = await response.arrayBuffer();
    const filename = `${uuidv4()}.jpg`;
    const uploadDir = path.join(__dirname, "../../../uploads");

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));

    return filename;
  } catch (error) {
    console.error("Error saving image:", error);
    return imageUrl;
  }
};

export const linkedinCallback = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      res.status(400).json({ message: "Authorization code is required" });
      return;
    }

    const tokenData = await fetchAccessToken(code);
    const userInfo = await fetchUserInfo(tokenData.access_token);
    console.log(userInfo);

    // Download and save the profile picture

    let user = await prisma.user.findFirst({
      where: {
        linkedInId: userInfo.sub,
      },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    // If user not found, create one
    if (!user) {
      const savedImagePath = await downloadAndSaveImage(userInfo.picture);

      user = await prisma.user.create({
        data: {
          linkedInId: userInfo.sub,
          name: userInfo.name,
          email: userInfo.email,
          image: savedImagePath || userInfo.picture,
          lastLogin: new Date(),
        },
        include: {
          studentProfile: true,
          expertProfile: true,
        },
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        activeProfile: user.activeProfile,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // Prepare response data based on activeProfile
    const responseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: getImageUrl(`/uploads/${user.image}`),
      activeProfile: user.activeProfile,
      profile:
        user.activeProfile === "STUDENT"
          ? user.studentProfile
          : user.expertProfile,
    };

    res.json({
      message: "Authentication successful",
      token,
      user: responseData,
    });
  } catch (error) {
    console.error("Authentication error:", error);

    const statusCode =
      error instanceof Error && error.message.includes("status:") ? 502 : 500;
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    res.status(statusCode).json({
      message: "Authentication failed",
      error: errorMessage,
    });
  }
};

export const fordev = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    console.log(email);

    // Validate input
    if (!email) {
      res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    // Create token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        activeProfile: user.activeProfile,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Optional: Update lastLogin
    let data = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to login",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const updateUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, email, profile } = req.body;
    const newImage = req.file;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    if (!currentUser) {
      if (newImage) {
        fs.unlinkSync(path.join(__dirname, "../../uploads", newImage.filename));
      }
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (newImage && currentUser.image) {
      const oldImagePath = path.join(
        __dirname,
        "../../uploads",
        currentUser.image
      );
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Update basic user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || currentUser.name,
        email: email || currentUser.email,
        image: newImage ? newImage.filename : currentUser.image,
        // Update profile based on activeProfile
        ...(currentUser.activeProfile === "STUDENT" && {
          studentProfile: profile
            ? {
                upsert: {
                  create: {
                    profession: profile.profession,
                    organization: profile.organization,
                    location: profile.location,
                    description: profile.description,
                  },
                  update: {
                    profession: profile.profession,
                    organization: profile.organization,
                    location: profile.location,
                    description: profile.description,
                  },
                },
              }
            : undefined,
        }),
        ...(currentUser.activeProfile === "EXPERT" && {
          expertProfile: profile
            ? {
                upsert: {
                  create: {
                    profession: profile.profession,
                    organization: profile.organization,
                    location: profile.location,
                    description: profile.description,
                    experience: profile.experience,
                    hourlyRate: profile.hourlyRate,
                    skills: profile.skills,
                    availableDays: profile.availableDays,
                    availableTime: profile.availableTime,
                  },
                  update: {
                    profession: profile.profession,
                    organization: profile.organization,
                    location: profile.location,
                    description: profile.description,
                    experience: profile.experience,
                    hourlyRate: profile.hourlyRate,
                    skills: profile.skills,
                    availableDays: profile.availableDays,
                    availableTime: profile.availableTime,
                  },
                },
              }
            : undefined,
        }),
      },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    const imageUrl = updatedUser.image
      ? getImageUrl(`/uploads/${updatedUser.image}`)
      : null;

    // Prepare response data based on activeProfile
    const responseData = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      image: imageUrl,
      activeProfile: updatedUser.activeProfile,
      profile:
        updatedUser.activeProfile === "STUDENT"
          ? updatedUser.studentProfile
          : updatedUser.expertProfile,
    };

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: responseData,
    });
  } catch (error) {
    if (req.file) {
      const errorImagePath = path.join(
        __dirname,
        "../../uploads",
        req.file.filename
      );
      if (fs.existsSync(errorImagePath)) {
        fs.unlinkSync(errorImagePath);
      }
    }

    console.error("Update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const beExpart = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    const {
      profession,
      organization,
      location,
      description,
      experience,
      hourlyRate,
      skills,
      availableDays,
      availableTime,
    } = req.body;

    const requiredFields = [
      "profession",
      "organization",
      "location",
      "description",
      "experience",
      "hourlyRate",
      "skills",
      "availableDays",
      "availableTime",
    ];

    const missingField = requiredFields.find((field) => !req.body[field]);

    // Find current user with profile
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // if (currentUser.expertProfile) {
    //   res.status(400).json({
    //     success: false,
    //     message: "You are already an expert"
    //   });
    //   return;
    // }

    // If expertProfile doesn't exist, all fields must be provided
    if (!currentUser.expertProfile && missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required`,
      });
      return;
    }

    // Create or update the expert profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        activeProfile: "EXPERT",
        expertProfile: currentUser.expertProfile
          ? {
              update: {
                profession,
                organization,
                location,
                description,
                experience,
                hourlyRate,
                skills,
                availableDays,
                availableTime,
              },
            }
          : {
              create: {
                profession,
                organization,
                location,
                description,
                experience,
                hourlyRate,
                skills,
                availableDays,
                availableTime,
              },
            },
      },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    // Generate JWT
    const token = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        activeProfile: updatedUser.activeProfile,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    const responseData = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      image: updatedUser.image
        ? getImageUrl(`/uploads/${updatedUser.image}`)
        : null,
      activeProfile: updatedUser.activeProfile,
      profile: updatedUser.expertProfile,
    };

    res.json({
      success: true,
      message: "Successfully became an expert",
      token,
      user: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Something went wrong",
    });
  }
};

export const beStudent = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        activeProfile: "STUDENT",
      },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    const token = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        activeProfile: updatedUser.activeProfile,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    const responseData = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      image: updatedUser.image
        ? getImageUrl(`/uploads/${updatedUser.image}`)
        : null,
      activeProfile: updatedUser.activeProfile,
      profile: updatedUser.studentProfile,
    };

    res.json({
      success: true,
      message: "Successfully became a student",
      token,
      user: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Something went wrong",
    });
  }
};

// import React from "react";

// const Login = () => {
//   const handleLogin = () => {
//     const params = new URLSearchParams({
//       response_type: "code",
//       client_id: "785hgn6asywpg6",
//       redirect_uri: "http://192.168.4.3:8000/auth/linkedin/callback",
//       scope: "openid email profile",
//     });
//     window.location.href = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
//   };
//   return (
//     <div>
//       <h1>Linkdin Login</h1>

//       <button onClick={handleLogin}>Signin with Linkdin</button>
//     </div>
//   );
// };

// export default Login;

// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtYzRkejAzcjAwMDB1b3R3M3J4ZnJjcGkiLCJlbWFpbCI6InRxbWhvc2FpbkBnbWFpbC5jb20iLCJuYW1lIjoiVFFNIEhvc2FpbiIsImFjdGl2ZVByb2ZpbGUiOiJTVFVERU5UIiwiaWF0IjoxNzUwMzk4MzMwLCJleHAiOjE3NTEwMDMxMzB9.JoosjkTH57iFeRIf2NceGAYR99jaJ7M99HWhSrtu2pc
