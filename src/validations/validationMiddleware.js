/**
 * validationMiddleware.js
 *
 * A lightweight validation runner that works with plain schema objects.
 * No external packages needed — plugs directly into Express and AppError.
 *
 * Usage in a route file:
 *   const { validate } = require('../validations/validationMiddleware');
 *   const { registerSchema } = require('../validations/authValidation');
 *
 *   router.post('/register', validate(registerSchema), authController.register);
 */

const AppError = require('../utils/appError');

// ─── Primitive Validators ──────────────────────────────────────────────────────

const isString = (v) => typeof v === 'string';
const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);
const isBoolean = (v) => typeof v === 'boolean';
const isArray = (v) => Array.isArray(v);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONGO_ID_RE = /^[a-f\d]{24}$/i;

// ─── Field Rule Runner ─────────────────────────────────────────────────────────

/**
 * Runs one field's rules and returns the first error message, or null if valid.
 *
 * @param {*}      value  - The raw value from req.body / req.params / req.query
 * @param {Object} rules  - Rule definition object (see schema docs below)
 * @param {string} field  - Field name used in error messages
 */
const runFieldRules = (value, rules, field) => {
  const isEmpty =
    value === undefined ||
    value === null ||
    (isString(value) && value.trim() === '');

  // required
  if (rules.required && isEmpty) {
    return rules.requiredMessage || `${field} is required`;
  }

  // If the field is optional and empty, skip all further checks
  if (!rules.required && isEmpty) return null;

  // type
  if (rules.type) {
    const typeMap = {
      string: isString,
      number: isNumber,
      boolean: isBoolean,
      array: isArray,
      mongoId: (v) => isString(v) && MONGO_ID_RE.test(v),
      email: (v) => isString(v) && EMAIL_RE.test(v),
    };
    const checker = typeMap[rules.type];
    if (checker && !checker(value)) {
      return rules.typeMessage || `${field} must be a valid ${rules.type}`;
    }
  }

  // string-specific rules
  if (isString(value)) {
    const trimmed = value.trim();
    if (rules.minLength && trimmed.length < rules.minLength) {
      return (
        rules.minLengthMessage ||
        `${field} must be at least ${rules.minLength} characters`
      );
    }
    if (rules.maxLength && trimmed.length > rules.maxLength) {
      return (
        rules.maxLengthMessage ||
        `${field} must not exceed ${rules.maxLength} characters`
      );
    }
    if (rules.pattern && !rules.pattern.test(trimmed)) {
      return rules.patternMessage || `${field} format is invalid`;
    }
  }

  // number-specific rules
  if (isNumber(value)) {
    if (rules.min !== undefined && value < rules.min) {
      return rules.minMessage || `${field} must be at least ${rules.min}`;
    }
    if (rules.max !== undefined && value > rules.max) {
      return rules.maxMessage || `${field} must not exceed ${rules.max}`;
    }
  }

  // array-specific rules
  if (isArray(value)) {
    if (rules.maxItems !== undefined && value.length > rules.maxItems) {
      return (
        rules.maxItemsMessage ||
        `${field} must not contain more than ${rules.maxItems} items`
      );
    }
    if (rules.itemType) {
      const allValid = value.every((item) => typeof item === rules.itemType);
      if (!allValid) {
        return (
          rules.itemTypeMessage ||
          `All items in ${field} must be of type ${rules.itemType}`
        );
      }
    }
  }

  // enum
  if (rules.enum && !rules.enum.includes(value)) {
    return (
      rules.enumMessage || `${field} must be one of: ${rules.enum.join(', ')}`
    );
  }

  // custom validator — (value) => errorMessage | null
  if (rules.custom) {
    const customError = rules.custom(value);
    if (customError) return customError;
  }

  return null;
};

// ─── Schema Shape ──────────────────────────────────────────────────────────────
//
// A schema is a plain object:
// {
//   body:   { fieldName: ruleObject, ... },
//   params: { fieldName: ruleObject, ... },
//   query:  { fieldName: ruleObject, ... },
// }
//
// ruleObject keys:
//   required        {boolean}  - fail if missing/empty
//   requiredMessage {string}   - custom "required" error
//   type            {string}   - 'string' | 'number' | 'boolean' | 'array' | 'mongoId' | 'email'
//   typeMessage     {string}   - custom type error
//   minLength       {number}
//   maxLength       {number}
//   min             {number}   - for numbers
//   max             {number}   - for numbers
//   maxItems        {number}   - for arrays
//   itemType        {string}   - primitive type check for array items
//   pattern         {RegExp}
//   patternMessage  {string}
//   enum            {Array}
//   enumMessage     {string}
//   custom          {Function} - (value) => errorMessage | null

// ─── Middleware Factory ────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body / req.params / req.query
 * against the provided schema and calls next(AppError) on the first failure.
 */
const validate = (schema) => (req, res, next) => {
  const errors = [];

  const sources = {
    body: req.body || {},
    params: req.params || {},
    query: req.query || {},
  };

  Object.entries(sources).forEach(([source, data]) => {
    if (!schema[source]) return;

    Object.entries(schema[source]).forEach(([field, rules]) => {
      const error = runFieldRules(data[field], rules, field);
      if (error) errors.push(error);
    });
  });

  if (errors.length > 0) {
    return next(new AppError(errors[0], 400));
  }

  next();
};

module.exports = { validate };
