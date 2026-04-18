require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const startCronJobs = require('./src/utils/cronJobs');
const connectDB = require('./src/config/db'); // Import your new config file

const { initializeSockets } = require('./src/sockets/socketSetup');

const PORT = process.env.PORT || 5000;

// 1. Initialize Database Connection
connectDB();

// 2. Start Express Server

const server = http.createServer(app);
const io = initializeSockets(server);
app.set('io', io); // This allows you to use req.app.get('io') in your controllers!

startCronJobs(); // Start the cron jobs

server.listen(PORT, () =>
  console.log(`🚀 BioBeats Server running on port ${PORT}`)
);
