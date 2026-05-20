const { z } = require('zod');

const loginValidationSchema = z.object({
  body: z.object({
    email: z
      .string({
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format'),
    password: z
      .string({
        invalid_type_error: 'Password must be a string',
      })
      .min(5, 'Password must be at least 5 characters long'),
  }),
});

const adminSearchSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

module.exports = {
  loginValidationSchema,
  adminSearchSchema,
};
