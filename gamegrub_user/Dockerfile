# syntax=docker/dockerfile:1

FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app

# Some Flutter Docker images are checked out as root-owned Git repositories.
# Marking the SDK as safe keeps `flutter` commands non-interactive in CI/Docker.
RUN git config --global --add safe.directory /sdks/flutter || true

COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .

ARG API_ROOT_URL=http://localhost:3001
ARG FIREBASE_API_KEY=
ARG FIREBASE_APP_ID_WEB=
ARG FIREBASE_MESSAGING_SENDER_ID=
ARG FIREBASE_PROJECT_ID=
ARG FIREBASE_AUTH_DOMAIN=
ARG FIREBASE_STORAGE_BUCKET=
RUN dart run tool/write_firebase_web_config.dart && flutter build web --release \
  --dart-define=API_ROOT_URL=${API_ROOT_URL} \
  --dart-define=FIREBASE_API_KEY=${FIREBASE_API_KEY} \
  --dart-define=FIREBASE_APP_ID_WEB=${FIREBASE_APP_ID_WEB} \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID} \
  --dart-define=FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID} \
  --dart-define=FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN} \
  --dart-define=FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=30s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
