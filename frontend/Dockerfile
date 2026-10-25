# Stage 1: Build the React/Vite app
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Set the API base URL to empty so axios uses relative paths, 
# which Nginx will proxy to the backend container.
ENV VITE_API_BASE_URL=""
RUN npm run build

# Stage 2: Serve the app with Nginx
FROM nginx:alpine
# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy the built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
