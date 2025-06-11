import { Multer } from 'multer';

declare global {
  namespace Express {
    export interface Request {
      file?: Multer.File;
    }
  }
}


import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: any; 
    }
  }
}


declare global {
  namespace Express {
    export interface Request {
      file?: Multer.File;
      files?: Multer.File[];
    }
  }
}
