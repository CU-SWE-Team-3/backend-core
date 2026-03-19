/**
 * Async Error Wrapper — Eliminates try/catch boilerplate in controllers
 *
 * Wraps an async route handler and automatically forwards any error
 * to Express's next() so the global error handler catches it.
 *
 * Usage:
 *   exports.getUser = catchAsync(async (req, res, next) => {
 *     const user = await User.findById(req.params.id);
 *     res.status(200).json({ success: true, data: user });
 *   });
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
