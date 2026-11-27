FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Variables factices : uniquement pour que la compilation passe ; les vraies valeurs sont lues au démarrage
RUN DATABASE_URL=postgres://x:x@localhost:5432/x SESSION_SECRET=build VAULT_MASTER_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
