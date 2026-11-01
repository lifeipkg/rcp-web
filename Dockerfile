# 风控运营台（静态站，nginx 无特权镜像）
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY index.html styles.css app.js /usr/share/nginx/html/
EXPOSE 8080
