# 1. Use a lightweight Node.js environment
FROM node:20-bullseye-slim
# 2. Install FFmpeg globally (Crucial for your audio worker!)
RUN apt-get update && apt-get install -y ffmpeg

# 3. Set the working directory inside the cloud server
WORKDIR /app

# 4. Copy your package files and install dependencies
COPY package*.json ./
RUN npm install

# 5. Copy the rest of your app's code
COPY . .

# 6. Expose the port your Express API uses (change if not 5000)
EXPOSE 5000

# 7. Start the server and the worker using your concurrently script
CMD ["npm", "start"]
