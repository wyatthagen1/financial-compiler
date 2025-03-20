import { Request, Response, NextFunction } from "express";
import path from "path";

export const renderOverload = async (req: Request, res: Response, next: NextFunction) => {
    // Store the original render function
    const originalRender = res.render.bind(res);
    
    // Create a new render function
    res.render = function(
      view: string,
      options?: object | undefined,
      callback?: ((err: Error, html: string) => void) | undefined
    ) {
      
      // If this is an absolute path, use it directly
      if (path.isAbsolute(view)) {
        return originalRender(view, options, callback);
      }
      
      // For relative paths, use our known correct directory
      const viewPath = path.join(process.cwd(), 'dist', 'views', view);
      
      return originalRender(viewPath, options, callback);
    };
    
    next();
}
