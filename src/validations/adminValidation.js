// src/validations/adminValidation.js

// 1. Validation for submitting a new report
exports.submitReportSchema = {
  body: {
    targetType: {
      required: true,
      type: 'string',
      enum: ['Track', 'Comment', 'User'],
      enumMessage: 'targetType must be Track, Comment, or User',
    },
    targetId: {
      required: true,
      type: 'mongoId',
      typeMessage: 'targetId must be a valid MongoDB ID',
    },
    reason: {
      required: true,
      type: 'string',
      enum: ['Copyright', 'Inappropriate Content', 'Spam', 'Other'],
      enumMessage:
        'Reason must be Copyright, Inappropriate Content, Spam, or Other',
    },
  },
};

// 2. Validation for updating a report's status
exports.updateReportStatusSchema = {
  params: {
    id: { required: true, type: 'mongoId' },
  },
  body: {
    status: {
      required: true,
      type: 'string',
      enum: ['Pending', 'Reviewed', 'Resolved'],
      enumMessage: 'Status must be Pending, Reviewed, or Resolved',
    },
  },
};

// 3. Reusable validation for routes that only need a valid MongoDB ID in the URL params
exports.idParamSchema = {
  params: {
    id: { required: true, type: 'mongoId', typeMessage: 'Invalid ID format' },
  },
};
