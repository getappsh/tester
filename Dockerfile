FROM loadimpact/k6:latest AS k6official

# Base Node.js image
FROM node:16-alpine

# Make directory
# RUN mkdir /.npm && chown -R 1000870000:0 /.npm

# Switch to root user for security
USER root

# Set working directory
WORKDIR /app

# Install k6 (use root for package installation)
COPY --from=k6official /usr/bin/k6 .

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install 

# Copy the rest of the application files
COPY . .

RUN chmod +x test-k6.js k6

# Command to start the application
CMD ["k6", "run", "test-k6.js"]
