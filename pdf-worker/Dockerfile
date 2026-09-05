FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

USER pwuser

CMD ["node", "server.mjs"]
