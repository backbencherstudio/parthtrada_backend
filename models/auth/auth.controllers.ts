
import { Request, Response } from "express";

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

   res.json({
      message: "Authentication successful",
      code,
      accessToken: tokenData,
      userInfo,
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