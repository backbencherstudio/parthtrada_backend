import { v4 as uuidv4 } from "uuid";
import path from 'path';
import fs from 'fs';

export const downloadAndSaveImage = async (imageUrl: string): Promise<string> => {
 
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Failed to download image");
  
      const buffer = await response.arrayBuffer();
      const filename = `${uuidv4()}.jpg`;
      const filepath = path.join(__dirname, "../../uploads", filename);
  
      fs.writeFileSync(filepath, Buffer.from(buffer));
      return filename;
    } catch (error) {
      console.error("Error saving image:", error);
      return imageUrl;
    }
  };
  