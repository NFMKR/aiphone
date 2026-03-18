# 微信云托管：容器监听 process.env.PORT（与控制台「容器端口」一致，常见 80）
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY . .

RUN chown -R node:node /app

EXPOSE 80

# Node 20 内置 fetch，不依赖 wget/curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/health/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.js"]
