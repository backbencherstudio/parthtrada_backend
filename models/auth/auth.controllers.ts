import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthenticatedRequest } from "../../middleware/verifyUsers";

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

  console.log(LINKEDIN_CONFIG)
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


export const linkedinCallback = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code || typeof code !== "string") {
       res.status(400).json({ message: "Authorization code is required" });
       return
    }

    const tokenData = await fetchAccessToken(code);
    const userInfo = await fetchUserInfo(tokenData.access_token);
    
    let user = await prisma.user.findFirst({
      where: {
        linkedInId: userInfo.sub,
      },
      include: {
        studentProfile: true,
        expertProfile: true
      }
    });

    // If user not found, create one
    if (!user) {
      user = await prisma.user.create({
        data: {
          linkedInId: userInfo.sub,
          name: userInfo.name,
          email: userInfo.email,
          image: userInfo.picture,
          lastLogin: new Date()
        },
        include: {
          studentProfile: true,
          expertProfile: true
        }
      });
    }


    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        activeProfile: user.activeProfile
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // Prepare response data based on activeProfile
    const responseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      activeProfile: user.activeProfile,
      profile: user.activeProfile === 'STUDENT' 
        ? user.studentProfile 
        : user.expertProfile
    };

    res.json({
      message: "Authentication successful",
      token,
      user: responseData
    });

  } catch (error) {
    console.error("Authentication error:", error);
    
    const statusCode = error instanceof Error && error.message.includes("status:") ? 502 : 500;
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    res.status(statusCode).json({ 
      message: "Authentication failed", 
      error: errorMessage 
    });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    // Get current user with profile data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true
      }
    });

    if (!currentUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const { name, email, image, profile } = req.body;

    // Update basic user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || currentUser.name,
        email: email || currentUser.email,
        image: image || currentUser.image,
        // Update profile based on activeProfile
        ...(currentUser.activeProfile === 'STUDENT' && {
          studentProfile: profile ? {
            upsert: {
              create: {
                profession: profile.profession,
                organization: profile.organization,
                location: profile.location,
                description: profile.description
              },
              update: {
                profession: profile.profession,
                organization: profile.organization,
                location: profile.location,
                description: profile.description
              }
            }
          } : undefined
        }),
        ...(currentUser.activeProfile === 'EXPERT' && {
          expertProfile: profile ? {
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
                availableTime: profile.availableTime
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
                availableTime: profile.availableTime
              }
            }
          } : undefined
        })
      },
      include: {
        studentProfile: true,
        expertProfile: true
      }
    });

    // Prepare response data based on activeProfile
    const responseData = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      image: updatedUser.image,
      activeProfile: updatedUser.activeProfile,
      profile: updatedUser.activeProfile === 'STUDENT' 
        ? updatedUser.studentProfile 
        : updatedUser.expertProfile
    };

    res.json({
      message: "Profile updated successfully",
      user: responseData
    });

  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ 
      message: "Failed to update profile", 
      error: error instanceof Error ? error.message : "Internal server error" 
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
