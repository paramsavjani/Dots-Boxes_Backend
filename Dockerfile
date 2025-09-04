FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

ENV PORT=$PORT
ENV REDIS_HOST=$REDIS_HOST
ENV REDIS_PORT=$REDIS_PORT

COPY index.js /app/src/

EXPOSE 4005

CMD ["node", "src/index.js"]