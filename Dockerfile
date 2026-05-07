FROM node:20-alpine

RUN apk add --no-cache tzdata

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY server.js ./
COPY utils ./utils/
COPY db ./db/
COPY services ./services/
COPY routes ./routes/
COPY public ./public/

# Create persistent data directories
RUN mkdir -p data ssh-keys logs

EXPOSE 3000

CMD ["node", "server.js"]
