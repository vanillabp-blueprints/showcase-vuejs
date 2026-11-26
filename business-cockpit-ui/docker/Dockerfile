# The user interface behind the backend: nginx serves the files of packages/ui/dist, nothing more.
# Build with the repository as context, after npm run build:
#   docker build -f docker/Dockerfile -t business-cockpit-ui-nginx .
FROM nginx:1.29-alpine

COPY packages/ui/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
