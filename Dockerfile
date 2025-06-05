FROM grafana/k6:latest AS k6official

# Base Node.js image
FROM node:16-alpine

# Switch to root user for security
USER root
ARG uid=1004370000 \
    username=getapp

WORKDIR /getapp-tester
# Combine user creation and CA setup in a single layer
RUN echo "${username}:x:${uid}:${uid}:${username}:/home/${username}:/sbin/nologin" >> /etc/passwd && \
    echo "${username}:x:${uid}:" >> /etc/group && \
    apk --no-cache add ca-certificates bash curl && \
    mkdir -p /usr/local/share/ca-certificates/ && \
    chown -R ${uid}:${uid} /getapp-tester


# Set working directory

# Install k6 (use root for package installation)
COPY --chown=${uid}:${uid} --from=k6official /usr/bin/k6 .

# Copy package.json and package-lock.json
COPY --chown=${uid}:${uid} package*.json ./

# Install dependencies
RUN npm install 

# Copy the rest of the application files
COPY --chown=${uid}:${uid} . .

RUN ./k6 --version && \
    chmod +x k6-cron-runner.js  getmap-synthetic.js k6


CMD ["node", "k6-cron-runner.js"]
