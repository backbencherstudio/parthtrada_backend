export const getImageUrl = (imagePath: string) => {
    return `${process.env.APP_URL}${imagePath}`;
  };
  
  export const baseUrl = process.env.APP_URL;
  