# Use official lightweight Node.js image with prebuilt Chromium for Puppeteer rendering
FROM node:20-alpine

# Install Chromium and font packages required by Puppeteer rendering engine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-dejavu

# Tell Puppeteer to use installed Chromium binary instead of downloading browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory inside container
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install node dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose app port
EXPOSE 3000

# Set environment defaults
ENV PORT=3000
ENV NODE_ENV=production

# Start application
CMD ["node", "index.js"]
