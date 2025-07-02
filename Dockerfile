# Stage 1: The Builder
# This stage builds the application, including devDependencies
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all dependencies needed for the build
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Run the build script from package.json
# This creates the production-ready server in /dist and the frontend in /dist/public
RUN npm run build

# Stage 2: The Production Environment
# This stage creates the final, lean image for production
FROM node:20-alpine
WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built server from the builder stage
COPY --from=builder /app/dist ./dist

# Correctly copy the built client assets from the location specified in vite.config.ts
# The original path was /app/client/dist, but the build output is /app/dist/public
COPY --from=builder /app/dist/public ./client/dist

# Expose the port the server will run on
EXPOSE 5000

# Set the environment to production
ENV NODE_ENV=production

# Command to start the server in production mode
CMD ["npm", "run", "start"]
