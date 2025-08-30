FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

COPY index.js /app/src/

EXPOSE 4005

CMD ["node", "src/index.js"]