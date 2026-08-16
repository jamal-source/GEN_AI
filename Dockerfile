# Use lightweight official Node.js image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install dependencies (production)
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
