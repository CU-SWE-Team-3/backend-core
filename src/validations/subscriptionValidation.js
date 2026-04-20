exports.checkoutSchema = {
  body: {
    planType: {
      required: true,
      requiredMessage: 'Please provide a subscription planType.',
      type: 'string',
      enum: ['Pro', 'Go+'],
      enumMessage: 'Invalid plan selected. Must be either Pro or Go+.',
    },
  },
};
