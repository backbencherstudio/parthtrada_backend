import axios from "axios";
import moment from "moment-timezone";

interface CreateZoomMeetingParams {
  topic: string;
  startTime: Date | string; // ISO string or Date object
  duration: number; // in minutes
  agenda?: string;
  timezone?: string; // IANA timezone name, defaults to 'UTC'
  tracking_fields?: any,
  expert_email: string
}

interface ZoomMeeting {
  id: number;
  join_url: string;
  start_url: string;
  password: string;
}

/**
 * Creates a scheduled Zoom meeting using the Zoom REST API.
 *
 * Requirements:
 *   - `ZOOM_JWT_TOKEN` or `ZOOM_ACCESS_TOKEN` must be present in environment variables.
 *   - `ZOOM_USER_ID` can be set in env to specify host (defaults to `me`).
 *
 * @param params CreateZoomMeetingParams
 * @returns ZoomMeeting
 */



async function getAccessToken() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    null,
    {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}



export async function createZoomMeeting(params: CreateZoomMeetingParams): Promise<ZoomMeeting> {
  const {
    topic,
    startTime,
    duration,
    agenda = "",
    timezone = "UTC",
    expert_email,
    tracking_fields
  } = params;

  const accessToken = await getAccessToken();
  //   console.log("accessToken", accessToken)
  if (!accessToken) {
    throw new Error("Zoom access token not found in environment variables (ZOOM_JWT_TOKEN or ZOOM_ACCESS_TOKEN)");
  }

  const userId = process.env.ZOOM_USER_ID || "me";
  const isoStartTime = moment(startTime).tz(timezone).format("YYYY-MM-DDTHH:mm:ss");

  try {
    const response = await axios.post(
      `https://api.zoom.us/v2/users/me/meetings`,
      {
        topic,
        type: 2, // Scheduled meeting
        start_time: isoStartTime,
        duration, // minutes
        timezone,
        agenda,
        settings: {
          approval_type: 2,
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: true,
          meeting_authentication: false,
          auto_transcribing: true,
          auto_start_meeting_summary: true,
          live_transcription: true,
          // auto_recording: "cloud",
          // alternative_hosts: expert_email
        },
        tracking_fields: tracking_fields,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      id: response.data.id,
      join_url: response.data.join_url,
      start_url: response.data.start_url,
      password: response.data.password,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Zoom API error: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    throw error;
  }
}
