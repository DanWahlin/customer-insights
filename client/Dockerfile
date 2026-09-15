FROM node:24-alpine AS build

WORKDIR /workspace/client

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NG_APP_API_URL=/
ARG ENTRAID_CLIENT_ID=
ARG ENTRAID_TENANT_ID=
ARG ENTRAID_API_SCOPE=
ARG API_PORT=3000
ARG TEAM_ID=
ARG CHANNEL_ID=
ARG ACS_PHONE_NUMBER=
ARG ACS_EMAIL_ADDRESS=
ARG NG_APP_AI_ENABLED=false
ARG NG_APP_ACS_ENABLED=false
ARG NG_APP_ACS_EMAIL_ENABLED=false
ARG NG_APP_FOUNDRY_IQ_ENABLED=false

ENV NG_APP_API_URL=${NG_APP_API_URL} \
    ENTRAID_CLIENT_ID=${ENTRAID_CLIENT_ID} \
    ENTRAID_TENANT_ID=${ENTRAID_TENANT_ID} \
    ENTRAID_API_SCOPE=${ENTRAID_API_SCOPE} \
    API_PORT=${API_PORT} \
    TEAM_ID=${TEAM_ID} \
    CHANNEL_ID=${CHANNEL_ID} \
    ACS_PHONE_NUMBER=${ACS_PHONE_NUMBER} \
    ACS_EMAIL_ADDRESS=${ACS_EMAIL_ADDRESS} \
    NG_APP_AI_ENABLED=${NG_APP_AI_ENABLED} \
    NG_APP_ACS_ENABLED=${NG_APP_ACS_ENABLED} \
    NG_APP_ACS_EMAIL_ENABLED=${NG_APP_ACS_EMAIL_ENABLED} \
    NG_APP_FOUNDRY_IQ_ENABLED=${NG_APP_FOUNDRY_IQ_ENABLED}

RUN test -n "$ENTRAID_API_SCOPE" \
  && npm run build \
  && test -d /workspace/client/dist/angular-openai-graph-acs/browser \
  && grep -R -F "$ENTRAID_API_SCOPE" /workspace/client/dist/angular-openai-graph-acs/browser

FROM nginx:1.29-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf \
  && mkdir -p /tmp/nginx/client-body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi \
  && chown -R 101:0 /tmp/nginx /usr/share/nginx/html

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/client/dist/angular-openai-graph-acs/browser/ /usr/share/nginx/html/

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
