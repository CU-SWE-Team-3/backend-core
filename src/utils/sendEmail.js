const nodemailer = require('nodemailer');

// Create ONE pooled transporter at module load time — reused across all requests.
// pool:true tells nodemailer to keep connections open rather than open/close per send.
// maxConnections:5 prevents Gmail from seeing a burst of 50+ simultaneous logins.
let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  return transporter;
};

const sendEmail = async (options) => {
  const mailOptions = {
    from: `BioBeats Support <${process.env.EMAIL_USERNAME}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  await getTransporter().sendMail(mailOptions);
};

module.exports = sendEmail;
