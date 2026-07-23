// middleware/validate.ts
import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { httpStatusCode } from "../lib/constant";

export const validateRequest = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Validation error",
        errors
      });
    }

    next();
  };
};