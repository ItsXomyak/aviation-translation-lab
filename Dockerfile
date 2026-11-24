# Stage 1: validate the corpus CSVs and build the static site.
# Any data error fails the image build, so a running container keeps serving the previous version.
FROM python:3.13-alpine AS build
WORKDIR /app
COPY tools/build.py tools/build.py
COPY data data
COPY web web
RUN python3 tools/build.py --out /site

# Stage 2: serve the static files with Caddy (automatic HTTPS for the address in SITE_ADDRESS).
FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /site /srv
