# Apify Actor image. Only used for deployment to the platform — the local
# crawler (npm run crawl) needs none of this.
FROM apify/actor-node:20

COPY package*.json ./

# Include dev deps: tsx runs the TypeScript entrypoint directly, which keeps one
# source of truth for the JSON-LD extractor shared with the local crawler.
RUN npm install --include=dev --audit=false --fund=false \
 && echo "installed:" && (npm ls --omit=dev --all || true)

COPY . ./

CMD ["npm", "run", "start:actor", "--silent"]
